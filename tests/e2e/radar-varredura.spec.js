// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Radar IA · aviso da varredura
 *
 * Quando o token da Meta expira, todas as fontes do mesmo tipo
 * falham em todos os alvos e o painel exibia a mesma mensagem
 * gigante dezenas de vezes, escondendo a ação necessária. O
 * aviso precisa agrupar a falha repetida, dizendo quais fontes
 * foram afetadas e quantas vezes ocorreu.
 */

const PAGINA = '/radar-ia/index.html';
const SESSAO_KEY = 'hospedah_radar_sessao_v1';

const TOKEN_MORTO =
  'Facebook Graph API: token expirado ou revogado (Error validating ' +
  'access token). Gere um novo token de Página de longa duração no ' +
  'Graph API Explorer e regrave o secret FACEBOOK_PAGE_ACCESS_TOKEN / ' +
  'INSTAGRAM_ACCESS_TOKEN.';

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

  await page.route('**/functions/v1/radar-ia', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, itens: [], detalhes: [] }),
    }),
  );
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, unknown>} corpo
 */
async function mockarCaptura(page, corpo) {
  await page.route('**/functions/v1/radar-captura', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(corpo),
    }),
  );
}

test.describe('Radar IA — VARRER AGORA', () => {
  test.beforeEach(async ({ page }) => {
    await abrirPainel(page);

    page.on('dialog', (d) => d.accept());
  });

  test('a mesma falha de token aparece uma vez com a contagem', async ({ page }) => {
    await mockarCaptura(page, {
      ok: true,
      capturados: 0,
      detalhes: [
        { alvo: 'Hot Beach', fonte: 'Página Hospedah', erro: TOKEN_MORTO },
        { alvo: 'Hot Beach', fonte: 'Grupo Hot Beach', erro: TOKEN_MORTO },
        { alvo: 'São Pedro', fonte: 'Página Hospedah', erro: TOKEN_MORTO },
        { alvo: 'São Pedro', fonte: 'Grupo Hot Beach', erro: TOKEN_MORTO },
      ],
    });

    await page.goto(PAGINA);

    await page.locator('[onclick="varrer(null)"]').first().click();

    const avisos = page.locator('#avisos');

    await expect(avisos).toContainText(/Varredura concluída/, {
      timeout: 15000,
    });

    await expect(avisos).toContainText('(4x)');
    await expect(avisos).toContainText('Página Hospedah, Grupo Hot Beach');

    const repeticoes = (await avisos.innerText())
      .split('token expirado ou revogado')
      .length - 1;

    expect(repeticoes).toBe(1);
  });
});
