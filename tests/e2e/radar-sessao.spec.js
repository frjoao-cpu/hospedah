// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Radar IA · sessão do painel
 *
 * O painel guarda a sessão em localStorage (hospedah_radar_sessao_v1)
 * com access_token, refresh_token e expires_at. O boot só pode
 * esconder o formulário de login quando a sessão ainda é utilizável,
 * e um token vencido deve ser renovado via
 * /auth/v1/token?grant_type=refresh_token antes das chamadas.
 */

const PAGINA = '/radar-ia/index.html';
const SESSAO_KEY = 'hospedah_radar_sessao_v1';
const TOKEN_KEY = 'hospedah_radar_token';

/**
 * Injeta uma entrada no localStorage antes de a página carregar.
 * @param {import('@playwright/test').Page} page
 * @param {string} chave
 * @param {string} valor
 */
async function semear(page, chave, valor) {
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [chave, valor],
  );
}

/**
 * Isola o teste do Supabase real: nenhuma leitura sai da máquina.
 * @param {import('@playwright/test').Page} page
 */
async function mockarLeituras(page) {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }),
  );
}

test.describe('Radar IA — boot da sessão', () => {
  test.beforeEach(async ({ page }) => {
    await mockarLeituras(page);
  });

  test('sem sessão o login aparece', async ({ page }) => {
    await page.goto(PAGINA);

    await expect(page.locator('#login')).toBeVisible();
  });

  test('sessão expirada e sem refresh_token abre o login', async ({ page }) => {
    await semear(
      page,
      SESSAO_KEY,
      JSON.stringify({
        access_token: 'token-vencido',
        refresh_token: '',
        expires_at: Date.now() - 60000,
      }),
    );

    await page.goto(PAGINA);

    await expect(page.locator('#login')).toBeVisible();

    // A sessão inutilizável é descartada em vez de ficar
    // gerando 401 a cada chamada.
    const guardado = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      SESSAO_KEY,
    );

    expect(guardado).toBeNull();
  });

  test('token vencido é renovado pelo refresh_token', async ({ page }) => {
    let pedidosDeRefresh = 0;

    await page.route('**/auth/v1/token**', (route) => {
      pedidosDeRefresh += 1;

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'token-renovado',
          refresh_token: 'refresh-novo',
          expires_in: 3600,
        }),
      });
    });

    await semear(
      page,
      SESSAO_KEY,
      JSON.stringify({
        access_token: 'token-vencido',
        refresh_token: 'refresh-valido',
        expires_at: Date.now() - 60000,
      }),
    );

    await page.goto(PAGINA);

    await expect
      .poll(() => pedidosDeRefresh, { timeout: 10000 })
      .toBeGreaterThan(0);

    await expect(page.locator('#login')).toBeHidden();

    const sessao = await page.evaluate(
      (k) => JSON.parse(window.localStorage.getItem(k) || 'null'),
      SESSAO_KEY,
    );

    expect(sessao.access_token).toBe('token-renovado');
    expect(sessao.refresh_token).toBe('refresh-novo');
    expect(sessao.expires_at).toBeGreaterThan(Date.now());
  });

  test('refresh recusado avisa que a sessão expirou', async ({ page }) => {
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant' }),
      }),
    );

    await semear(
      page,
      SESSAO_KEY,
      JSON.stringify({
        access_token: 'token-vencido',
        refresh_token: 'refresh-revogado',
        expires_at: Date.now() - 60000,
      }),
    );

    await page.goto(PAGINA);

    await expect(page.locator('#login')).toBeVisible();

    await expect(page.locator('#loginMsg')).toContainText(/sessão expirada/i);
  });

  test('token legado sem validade conhecida é migrado no boot', async ({ page }) => {
    await semear(page, TOKEN_KEY, 'token-legado');

    await page.goto(PAGINA);

    await expect(page.locator('#login')).toBeHidden();
  });
});
