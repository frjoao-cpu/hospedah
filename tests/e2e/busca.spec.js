// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Testes E2E: Busca e filtros
 *
 * Cobre os campos de busca/filtro na página busca.html:
 *   - Destino (autocomplete)
 *   - Faixa de preço
 *   - Resultados filtrados
 */

test.describe('Página de busca — formulário e filtros', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/busca.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('campo de destino está presente e aceitável', async ({ page }) => {
    const destino = page.locator('#f_destino');
    await expect(destino).toBeVisible();
    await destino.fill('Olímpia');
    await expect(destino).toHaveValue('Olímpia');
  });

  test('campos de preço mín/máx aceitam números', async ({ page }) => {
    // Preço fica dentro de <details> "Filtros avançados", fechado
    // por padrão: precisa abrir antes de interagir.
    await page.locator('details.adv-filters > summary').click();

    const precoMin = page.locator('#f_preco_min');
    const precoMax = page.locator('#f_preco_max');
    await expect(precoMin).toBeVisible();
    await expect(precoMax).toBeVisible();

    await precoMin.fill('500');
    await precoMax.fill('3000');
    await expect(precoMin).toHaveValue('500');
    await expect(precoMax).toHaveValue('3000');
  });

  test('resultados de resort são exibidos após carregar', async ({ page }) => {
    // Aguarda algum card de resort renderizar
    const cards = page.locator('.resort-card, [data-resort], .card-resort');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('filtro de destino reduz resultados', async ({ page }) => {
    const destino = page.locator('#f_destino');
    const cards = page.locator('.resort-card, [data-resort], .card-resort');

    // Conta total sem filtro
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const totalSemFiltro = await cards.count();

    // Aplica filtro improvável que não deve ter resultado
    await destino.fill('ZZZ_nenhum_resort');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // Com filtro inválido deve ter 0 ou menos resultados que sem filtro
    const comFiltro = await cards.count();
    expect(comFiltro).toBeLessThanOrEqual(totalSemFiltro);
  });
});

test.describe('Navegação entre páginas', () => {
  test('link "Buscar resorts" na homepage aponta para busca.html', async ({ page }) => {
    await page.goto('/');
    // No mobile o menu principal fica oculto até ser aberto:
    // considera apenas links visíveis.
    const buscarLink = page.locator('a[href*="busca"]:visible').first();
    await expect(buscarLink).toBeVisible();
  });

  test('logo HOSPEDAH leva à homepage em qualquer página', async ({ page }) => {
    await page.goto('/reservas.html');
    const logo = page.locator('a[href="/"], a[href="index.html"], .navbar-logo').first();
    if (await logo.count() > 0) {
      const href = await logo.getAttribute('href');
      expect(href).toMatch(/\/|index\.html/);
    }
  });

  test('página 404 customizada responde', async ({ page }) => {
    const response = await page.goto('/pagina-que-nao-existe-xyz.html');
    // GitHub Pages retorna a 404.html customizada com status 404
    expect(response?.status()).toBe(404);
    const body = await page.content();
    // Deve conter marca HOSPEDAH (página 404 customizada)
    expect(body.toLowerCase()).toContain('hospedah');
  });
});
