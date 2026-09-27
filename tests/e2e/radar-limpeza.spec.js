// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Radar IA · botões de limpeza
 *
 * A limpeza apaga histórico de verdade. O painel precisa
 * mostrar a prévia antes, pedir confirmação e nunca disparar
 * o DELETE quando o operador cancela.
 */

const PAGINA = '/radar-ia/index.html';
const SESSAO_KEY = 'hospedah_radar_sessao_v1';

const PREVIA = {
  ok: true,
  previa: true,
  itens: [
    {
      alvo: 'cache_ia',
      rotulo: 'Cache de análises da IA',
      descricao: 'Respostas reaproveitadas por hash do texto.',
      dias: 60,
      dias_minimo: 7,
      total: 42,
    },
    {
      alvo: 'alertas',
      rotulo: 'Histórico de alertas',
      descricao: 'Trilha de WhatsApp/e-mail enviados ao time.',
      dias: 90,
      dias_minimo: 7,
      total: 0,
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
 * Intercepta a Edge Function e guarda cada corpo recebido,
 * para o teste conferir o que o painel realmente enviou.
 *
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

test.describe('Radar IA — limpeza', () => {
  test('CALCULAR LIMPEZA lista o que pode ser apagado', async ({ page }) => {
    await abrirPainel(page);

    await mockarFuncao(page, () => PREVIA);

    await irParaSaude(page);

    await page.locator('[data-acao="previa-limpeza"]').first().click();

    const painel = page.locator('#painelLimpeza');

    await expect(painel).toContainText('Cache de análises da IA', {
      timeout: 15000,
    });

    await expect(painel).toContainText('42 registro(s) com mais de 60 dias');

    // Sem nada elegível o APAGAR fica bloqueado.
    await expect(
      painel.locator('[data-acao="limpar"][data-alvo="alertas"]'),
    ).toBeDisabled();

    await expect(
      painel.locator('[data-acao="limpar"][data-alvo="cache_ia"]'),
    ).toBeEnabled();
  });

  test('cancelar a confirmação não apaga nada', async ({ page }) => {
    await abrirPainel(page);

    const chamadas = await mockarFuncao(page, () => PREVIA);

    page.on('dialog', (d) => d.dismiss());

    await irParaSaude(page);

    await page.locator('[data-acao="previa-limpeza"]').first().click();

    await expect(page.locator('#painelLimpeza')).toContainText(
      'Cache de análises da IA',
      { timeout: 15000 },
    );

    await page
      .locator('[data-acao="limpar"][data-alvo="cache_ia"]')
      .click();

    await page.waitForTimeout(500);

    const apagou = chamadas.some((c) => c.acao === 'limpar' && !c.previa);

    expect(apagou).toBe(false);
  });

  test('confirmar envia o alvo e os dias da tela', async ({ page }) => {
    await abrirPainel(page);

    const chamadas = await mockarFuncao(page, (corpo) =>
      corpo.previa
        ? PREVIA
        : {
            ok: true,
            previa: false,
            alvo: corpo.alvo,
            removidos: 42,
            mensagem: '42 registro(s) removido(s) do cache.',
          },
    );

    page.on('dialog', (d) => d.accept());

    await irParaSaude(page);

    await page.locator('[data-acao="previa-limpeza"]').first().click();

    await expect(page.locator('#painelLimpeza')).toContainText(
      'Cache de análises da IA',
      { timeout: 15000 },
    );

    await page.locator('#limpezaDias0').fill('120');

    await page
      .locator('[data-acao="limpar"][data-alvo="cache_ia"]')
      .click();

    await expect(page.locator('#limpezaMsg')).toContainText(
      '42 registro(s) removido(s)',
      { timeout: 15000 },
    );

    const pedido = chamadas.find((c) => c.acao === 'limpar' && !c.previa);

    expect(pedido).toBeTruthy();
    expect(pedido.alvo).toBe('cache_ia');
    expect(pedido.dias).toBe(120);
  });

  test('erro da função aparece no painel, não em alert', async ({ page }) => {
    await abrirPainel(page);

    await page.route('**/functions/v1/radar-ia', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Tabela radar_alertas não existe' }),
      }),
    );

    let abriuDialogo = false;

    page.on('dialog', (d) => {
      abriuDialogo = true;

      return d.accept();
    });

    await irParaSaude(page);

    await page.locator('[data-acao="previa-limpeza"]').first().click();

    await expect(page.locator('#limpezaMsg')).toContainText(
      'radar_alertas',
      { timeout: 15000 },
    );

    expect(abriuDialogo).toBe(false);
  });
});
