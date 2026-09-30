const { test, expect } = require('@playwright/test');

test('CRM redireciona para o painel após autenticação da equipe', async ({ page }) => {
  const mockSupabase = `
    (() => {
      const query = (table) => {
        const builder = {
          select() { return this; },
          order() { return this; },
          limit() { return this; },
          eq() { return this; },
          in() { return this; },
          maybeSingle() {
            return Promise.resolve({ data: table === 'profiles' ? { role: 'admin' } : null, error: null });
          },
          then(resolve, reject) {
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
        };
        return builder;
      };
      window.supabase = {
        createClient() {
          return {
            auth: {
              getSession: async () => ({
                data: { session: localStorage.getItem('crm-signed-in') ? { user: { id: 'admin-id' } } : null }
              }),
              signInWithPassword: async () => {
                localStorage.setItem('crm-signed-in', 'true');
                return { error: null };
              },
              signOut: async () => ({})
            },
            from: query,
            channel() {
              const channel = { on() { return channel; }, subscribe(callback) { callback('SUBSCRIBED'); return channel; } };
              return channel;
            }
          };
        }
      };
    })();
  `;
  await page.addInitScript(() => localStorage.clear());
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: mockSupabase }));
  await page.goto('/portal/?next=%2Fadmin%2F');
  await expect(page.locator('.portal-logo-tagline')).toContainText('Acesso à equipe · CRM');
  await page.locator('#loginEmail').fill('admin@example.com');
  await page.locator('#loginPassword').fill('password');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();

  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByRole('heading', { name: 'CRM de Leads' })).toBeVisible();
});

test('CRM mostra alertas, timeline, notas, responsáveis e aprovações com Realtime', async ({ page }) => {
  const mockSupabase = `
    (() => {
      const now = Date.now();
      const leads = [
        { id: 'lead-current', nome: 'Lead atual', email: 'atual@example.com', whatsapp: '11999999999', origem: 'chat', score: 72, status_pipeline: 'novo', criado_em: new Date(now - 3 * 86400000).toISOString(), atualizado_em: new Date(now - 25 * 3600000).toISOString() },
        { id: 'lead-prior', nome: 'Lead anterior', email: 'anterior@example.com', whatsapp: '', origem: 'busca', score: 80, status_pipeline: 'fechado', criado_em: new Date(now - 35 * 86400000).toISOString(), atualizado_em: new Date(now - 35 * 86400000).toISOString() }
      ];
      const tables = {
        leads,
        profiles: [
          { id: 'admin-id', role: 'admin', nome_completo: 'Admin' },
          { id: 'owner-id', role: 'proprietario', nome_completo: 'Proprietário' }
        ],
        reservas_hospede: [
          ...[1, 2, 3].map((day) => ({ id: 'cancel-' + day, nome_hospede: 'Hóspede', status: 'cancelada', criado_em: new Date(now - day * 86400000).toISOString(), atualizado_em: new Date(now - day * 86400000).toISOString() })),
          { id: 'cancel-prior', nome_hospede: 'Hóspede', status: 'cancelada', criado_em: new Date(now - 35 * 86400000).toISOString(), atualizado_em: new Date(now - 35 * 86400000).toISOString() }
        ],
        aprovacoes_pendentes: [{ id: 'approval-1', tipo: 'alteracao_tarifa', descricao: 'Ajustar tarifa', status: 'pendente', criado_em: new Date().toISOString() }],
        leads_historico: [{ lead_id: 'lead-current', tipo_evento: 'etapa_alterada', descricao: 'Etapa: novo → contatado', criado_em: new Date().toISOString() }],
        leads_notas: [{ lead_id: 'lead-current', nota: 'Contato solicitado', criado_em: new Date().toISOString() }]
      };
      window.__crmCalls = [];
      const query = (table) => {
        const state = { filters: [], operation: 'select', payload: null };
        const builder = {
          select() { return this; },
          order() { return this; },
          limit() { return this; },
          eq(key, value) { state.filters.push([key, value]); return this; },
          in(key, value) { state.filters.push([key, value]); return this; },
          update(value) { state.operation = 'update'; state.payload = value; return this; },
          insert(value) { state.operation = 'insert'; state.payload = value; return this; },
          execute() {
            window.__crmCalls.push({ table, operation: state.operation, payload: state.payload });
            if (table === 'profiles' && state.filters.some(([key]) => key === 'id')) {
              return { data: tables.profiles.find((row) => row.id === state.filters.find(([key]) => key === 'id')[1]) || null, error: null };
            }
            const rows = (tables[table] || []).filter((row) => state.filters.every(([key, value]) => {
              if (Array.isArray(value)) return value.includes(row[key]);
              return row[key] === value;
            }));
            if (state.operation === 'update') {
              rows.forEach((row) => Object.assign(row, state.payload));
              return { data: rows[0] || null, error: null };
            }
            if (state.operation === 'insert') {
              if (table === 'leads_notas') tables.leads_notas.unshift({ ...state.payload, criado_em: new Date().toISOString() });
              return { data: state.payload, error: null };
            }
            return { data: rows, error: null };
          },
          maybeSingle() { return Promise.resolve(this.execute()); },
          then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
        };
        return builder;
      };
      window.supabase = {
        createClient() {
          return {
            auth: { getSession: async () => ({ data: { session: { user: { id: 'admin-id' } } } }), signOut: async () => ({}) },
            from: query,
            functions: { invoke: async () => ({ data: null, error: null }) },
            channel() {
              const channel = { on() { return channel; }, subscribe(callback) { callback('SUBSCRIBED'); return channel; } };
              return channel;
            }
          };
        }
      };
    })();
  `;
  await page.route('**/supabase-js@2', (route) => route.fulfill({ contentType: 'application/javascript', body: mockSupabase }));
  await page.goto('/admin/index.html');

  await expect(page.locator('#realtimeStatus')).toHaveText('Realtime conectado.');
  await expect(page.locator('#crmAlerts')).toContainText('conversão caiu');
  await expect(page.locator('#crmAlerts')).toContainText('Pico de cancelamentos');
  await expect(page.locator('#crmAlerts')).toContainText('lead está sem resposta');
  await expect(page.locator('#approvalsTableBody')).toContainText('Ajustar tarifa');
  await expect(page.locator('#approvalsTableBody button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.locator('#approvalsTableBody')).toContainText('Nenhuma aprovação pendente');

  await page.locator('.crm-details-btn').first().click();
  await expect(page.locator('#leadTimeline')).toContainText('Etapa: novo');
  await expect(page.locator('#leadNotes')).toContainText('Contato solicitado');
  await page.locator('#leadAssignee').selectOption('owner-id');
  await page.locator('#saveLeadAssignee').click();
  await page.locator('#leadNoteInput').fill('Retornar amanhã');
  await page.locator('#addLeadNote').click();
  await expect(page.locator('#leadDetailsStatus')).toHaveText('Nota salva.');
  expect(await page.evaluate(() => window.__crmCalls.some((call) => call.table === 'leads' && call.operation === 'update' && call.payload.responsavel_id === 'owner-id'))).toBeTruthy();
  expect(await page.evaluate(() => window.__crmCalls.some((call) => call.table === 'leads_notas' && call.operation === 'insert'))).toBeTruthy();
});
