// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Smoke tests E2E
 *
 * Verifica que as páginas críticas carregam corretamente,
 * os elementos essenciais estão presentes e as navegações
 * principais funcionam.
 */

test.describe('Páginas públicas', () => {
  test('homepage carrega e exibe título correto', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });

  test('homepage exibe botão de orçamento via WhatsApp', async ({ page }) => {
    await page.goto('/');
    const waLink = page.locator('a[href*="wa.me"]').first();
    await expect(waLink).toBeVisible();
  });

  test('página de busca carrega', async ({ page }) => {
    await page.goto('/busca.html');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });

  test('página de reservas carrega', async ({ page }) => {
    await page.goto('/reservas.html');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });

  test('página de avaliações carrega', async ({ page }) => {
    await page.goto('/avaliacoes.html');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });

  test('chat IA carrega', async ({ page }) => {
    await page.goto('/chat.html');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });
});

test.describe('Páginas de resort', () => {
  const resorts = [
    { slug: 'hotbeach',  name: 'Hot Beach' },
    { slug: 'olimpia',   name: 'Olimpia' },
    { slug: 'saopedro',  name: 'São Pedro' },
    { slug: 'solar',     name: 'Solar' },
    { slug: 'wyndham',   name: 'Wyndham' },
    { slug: 'juquehy',   name: 'Juquehy' },
    { slug: 'ipioca',    name: 'Ipioca' },
    { slug: 'portoi2',   name: 'Porto' },
  ];

  for (const resort of resorts) {
    test(`resort ${resort.slug} carrega`, async ({ page }) => {
      await page.goto(`/resorts/${resort.slug}.html`);
      await expect(page).toHaveTitle(/HOSPEDAH/i);
      // Galeria de imagens presente
      const gallery = page.locator('.gallery img').first();
      await expect(gallery).toBeVisible();
      // Link de orçamento WhatsApp presente
      const waLink = page.locator('a.whatsapp');
      await expect(waLink).toBeVisible();
    });
  }
});

test.describe('Portal do hóspede', () => {
  test('página de login do portal carrega', async ({ page }) => {
    await page.goto('/portal/index.html');
    await expect(page).toHaveTitle(/HOSPEDAH/i);
  });

  test('dashboard do portal redireciona para login sem sessão', async ({ page }) => {
    await page.goto('/portal/dashboard.html');
    // Deve redirecionar para o login ou mostrar overlay de autenticação
    await page.waitForTimeout(2000);
    const url = page.url();
    const isRedirectedOrProtected =
      url.includes('/portal/index.html') ||
      url.includes('next=dashboard') ||
      (await page.locator('[id*="auth"], [id*="login"], [class*="auth"]').count()) > 0;
    expect(isRedirectedOrProtected).toBeTruthy();
  });
});

test.describe('Acessibilidade básica', () => {
  test('homepage tem meta description', async ({ page }) => {
    await page.goto('/');
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveCount(1);
    const content = await metaDescription.getAttribute('content');
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(10);
  });

  test('homepage tem Open Graph tags', async ({ page }) => {
    await page.goto('/');
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);
  });

  test('manifest.json é acessível', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response.status()).toBe(200);
  });

  test('service worker (sw.js) é acessível', async ({ page }) => {
    const response = await page.goto('/sw.js');
    expect(response.status()).toBe(200);
  });
});

test.describe('Páginas de erro', () => {
  test('página offline existe e carrega', async ({ page }) => {
    await page.goto('/offline.html');
    await expect(page).toHaveTitle(/.+/);
  });
});
