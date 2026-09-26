// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Radar IA · botão ANALISAR PENDENTES
 *
 * O lote pode levar minutos. O botão precisa mostrar que está
 * trabalhando (texto + desabilitado) e o painel precisa detalhar
 * o resultado — inclusive o erro de cada captura — sem depender
 * de alert(), que o operador pode ter bloqueado.
 */

const PAGINA = '/radar-ia/index.html';
const SESSAO_KEY = 'hospedah_radar_sessao_v1';

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
 * @param {Record<string, unknown>} corpo
 * @param {number} atraso
 */
async function mockarFuncao(page, corpo, atraso = 0) {
  await page.route('**/functions/v1/radar-ia', async (route) => {
    if (atraso) await new Promise((r) => setTimeout(r, atraso));

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    });
  });
}

test.describe('Radar IA — ANALISAR PENDENTES', () => {
  test.beforeEach(async ({ page }) => {
    await abrirPainel(page);

    // Nenhum alert deve ser necessário; se aparecer, é aceito
    // para não travar o teste.
    page.on('dialog', (d) => d.accept());
  });

  test('o botão avisa que está analisando e volta ao normal', async ({ page }) => {
    await mockarFuncao(
      page,
      {
        ok: true,
        pendentes_lidas: 1,
        analisados: 1,
        aprovados: 1,
        descartados: 0,
        falhas: 0,
        detalhes: [],
      },
      1500,
    );

    await page.goto(PAGINA);

    const botao = page.locator('[data-acao="pendentes"]').first();

    await botao.click();

    await expect(botao).toBeDisabled();
    await expect(botao).toContainText(/ANALISANDO/i);

    await expect(page.locator('#pendentesMsg')).toContainText(
      /Analisadas: 1/,
      { timeout: 15000 },
    );

    await expect(botao).toBeEnabled();
    await expect(botao).toContainText(/ANALISAR PENDENTES/i);
  });

  test('as falhas do lote aparecem uma a uma no painel', async ({ page }) => {
    await mockarFuncao(page, {
      ok: true,
      pendentes_lidas: 2,
      analisados: 1,
      aprovados: 0,
      descartados: 1,
      falhas: 1,
      trace_id: 'abc123',
      detalhes: [
        { captura_id: 'aaaaaaaa-1111', selecionada: false, motivo: 'fora do alvo' },
        { captura_id: 'bbbbbbbb-2222', erro: 'Estrutura da tabela desatualizada' },
      ],
    });

    await page.goto(PAGINA);

    await page.locator('[data-acao="pendentes"]').first().click();

    const aviso = page.locator('#pendentesMsg');

    await expect(aviso).toContainText(/Falhas: 1/, { timeout: 15000 });
    await expect(aviso).toContainText('bbbbbbbb');
    await expect(aviso).toContainText('Estrutura da tabela desatualizada');
    await expect(aviso).toContainText('abc123');
  });

  test('o painel agrega por que as capturas foram descartadas', async ({ page }) => {
    // "Descartadas: 8" sozinho não diz qual critério do alvo
    // fechou o funil — a agregação por regra é o que permite
    // calibrar o alvo sem abrir o banco.
    await mockarFuncao(page, {
      ok: true,
      pendentes_lidas: 8,
      analisados: 8,
      aprovados: 0,
      descartados: 8,
      falhas: 0,
      motivos: [
        {
          regra: 'EMPREENDIMENTO_FORA',
          rotulo: 'Empreendimento fora do alvo',
          quantidade: 6,
        },
        {
          regra: 'SCORE_BAIXO',
          rotulo: 'Score abaixo do mínimo do alvo',
          quantidade: 2,
        },
      ],
      detalhes: [],
    });

    await page.goto(PAGINA);

    await page.locator('[data-acao="pendentes"]').first().click();

    const aviso = page.locator('#pendentesMsg');

    await expect(aviso).toContainText(/Descartadas: 8/, { timeout: 15000 });
    await expect(aviso).toContainText('Empreendimento fora do alvo: 6');
    await expect(aviso).toContainText('Score abaixo do mínimo do alvo: 2');
  });

  test('REAVALIAR DESCARTADAS devolve as capturas para a fila', async ({ page }) => {
    await mockarFuncao(page, {
      ok: true,
      reenfileiradas: 8,
      mensagem: '8 captura(s) voltaram para a fila.',
    });

    await page.goto(PAGINA);

    const botao = page.locator('[data-acao="reenfileirar"]').first();

    await expect(botao).toBeVisible();

    await botao.click();

    await expect(page.locator('#pendentesMsg')).toContainText(
      /8 captura\(s\) voltaram para a fila/,
      { timeout: 15000 },
    );

    await expect(botao).toBeEnabled();
  });

  test('erro da função é mostrado no painel, não só em alert', async ({ page }) => {
    await page.route('**/functions/v1/radar-ia', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha ao gravar no banco.' }),
      }),
    );

    await page.goto(PAGINA);

    await page.locator('[data-acao="pendentes"]').first().click();

    await expect(page.locator('#pendentesMsg')).toContainText(
      /Falha ao gravar no banco/,
      { timeout: 15000 },
    );

    await expect(page.locator('[data-acao="pendentes"]').first()).toBeEnabled();
  });
});
