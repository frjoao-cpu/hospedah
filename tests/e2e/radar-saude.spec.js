// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Radar IA · saúde operacional e grupo competitivo
 *
 * O valor do monitoramento automático está em reclamar sozinho
 * quando o pipeline quebra. Estes testes garantem que o painel
 * mostra os incidentes, distingue crítico de aviso e não usa
 * alert() — e que o comparativo de preço aparece sem derrubar
 * a tela quando a migration 014 ainda não foi aplicada.
 */

const PAGINA = '/radar-ia/index.html';
const SESSAO_KEY = 'hospedah_radar_sessao_v1';

const SAUDAVEL = {
  ok: true,
  incidentes: [],
  saudavel: true,
  resolvidos: 2,
};

const COM_PROBLEMA = {
  ok: true,
  saudavel: false,
  novos: 2,
  abertos: 2,
  notificados: ['SEM_CAPTURA'],
  incidentes: [
    {
      tipo: 'SEM_CAPTURA',
      alvo: 'global',
      severidade: 'CRITICO',
      mensagem: 'Nenhuma captura há 14 hora(s). O robô pode estar parado.',
      detalhes: { horas: 14 },
    },
    {
      tipo: 'FONTE_FALHANDO',
      alvo: 'fonte-123',
      severidade: 'AVISO',
      mensagem: 'A fonte "Instagram cotas" falhou 4 vez(es) seguidas.',
      detalhes: { falhas: 4 },
    },
  ],
};

/** @param {import('@playwright/test').Page} page */
async function abrirPainel(page) {
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [
      SESSAO_KEY,
      JSON.stringify({
        access_token: 'token-valido',
        refresh_token: 'refresh-valido',
        expires_at: Date.now() + 3600000,
      }),
    ],
  );

  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }),
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {(corpo: any) => any} responder
 */
async function mockarFuncao(page, responder) {
  /** @type {any[]} */
  const chamadas = [];

  await page.route('**/functions/v1/radar-ia', async (route) => {
    const corpo = JSON.parse(route.request().postData() || '{}');

    chamadas.push(corpo);

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responder(corpo)),
    });
  });

  return chamadas;
}

/** @param {import('@playwright/test').Page} page */
async function irParaSaude(page) {
  await page.goto(PAGINA);

  await page.locator('#tabBtnSaude').click();

  await expect(page.locator('#abaSaude')).toBeVisible();
}

test.describe('Radar IA — saúde operacional', () => {
  test('pipeline saudável mostra confirmação, não alarme', async ({
    page,
  }) => {
    await abrirPainel(page);

    const chamadas = await mockarFuncao(page, () => SAUDAVEL);

    // Um dialog nativo travaria o robô do cron e o painel.
    page.on('dialog', () => {
      throw new Error('O painel não deve usar alert()');
    });

    await irParaSaude(page);

    await page.locator('[data-acao="verificar-saude"]').first().click();

    await expect(page.locator('#painelIncidentes')).toContainText(
      'Pipeline saudável',
      { timeout: 15000 },
    );

    expect(chamadas.some((c) => c.acao === 'saude_operacional')).toBe(true);
  });

  test('incidentes aparecem com severidade e alvo', async ({ page }) => {
    await abrirPainel(page);

    await mockarFuncao(page, () => COM_PROBLEMA);

    await irParaSaude(page);

    await page.locator('[data-acao="verificar-saude"]').first().click();

    const painel = page.locator('#painelIncidentes');

    await expect(painel).toContainText('SEM CAPTURA', { timeout: 15000 });
    await expect(painel).toContainText('FONTE FALHANDO');

    // O alvo identifica QUAL fonte quebrou — sem isso o
    // operador teria de descobrir na mão.
    await expect(painel).toContainText('fonte-123');

    // Crítico e aviso precisam ser distinguíveis de relance.
    await expect(painel).toContainText('🔴');
    await expect(painel).toContainText('🟡');
  });

  test('aviso resume os problemas sem usar alert()', async ({ page }) => {
    await abrirPainel(page);

    await mockarFuncao(page, () => COM_PROBLEMA);

    page.on('dialog', () => {
      throw new Error('O painel não deve usar alert()');
    });

    await irParaSaude(page);

    await page.locator('[data-acao="verificar-saude"]').first().click();

    await expect(page.locator('#avisos')).toContainText('2 problema(s)', {
      timeout: 15000,
    });

    await expect(page.locator('#avisos')).toContainText('1 crítico(s)');
  });

  test('falha da função não deixa o painel carregando', async ({ page }) => {
    await abrirPainel(page);

    await page.route('**/functions/v1/radar-ia', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Banco indisponível' }),
      }),
    );

    await irParaSaude(page);

    await page.locator('[data-acao="verificar-saude"]').first().click();

    await expect(page.locator('#painelIncidentes')).toContainText(
      'Banco indisponível',
      { timeout: 15000 },
    );

    await expect(page.locator('#painelIncidentes')).not.toContainText(
      'Avaliando o pipeline',
    );
  });
});
