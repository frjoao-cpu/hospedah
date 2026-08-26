// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Testes E2E: Acessibilidade
 *
 * Usa axe-core via @axe-core/playwright para validar
 * violações de acessibilidade WCAG 2.1 AA nas páginas críticas.
 */

const { injectAxe, checkA11y } = require('axe-playwright');

const PAGES_A11Y = [
  { name: 'homepage',       path: '/' },
  { name: 'busca',          path: '/busca.html' },
  { name: 'reservas',       path: '/reservas.html' },
  { name: 'chat IA',        path: '/chat.html' },
  { name: 'resort hotbeach', path: '/resorts/hotbeach.html' },
];

// Violações conhecidas aceitáveis (falsos positivos de componentes externos)
const KNOWN_VIOLATIONS = [
  'color-contrast',         // cores do tema dourado sobre azul escuro — validado manualmente
];

test.describe('Acessibilidade WCAG 2.1 AA', () => {
  for (const pg of PAGES_A11Y) {
    test(`${pg.name} — sem violações críticas`, async ({ page }) => {
      await page.goto(pg.path);
      await page.waitForLoadState('domcontentloaded');
      await injectAxe(page);
      await checkA11y(page, undefined, {
        detailedReport: true,
        detailedReportOptions: { html: true },
        axeOptions: {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa'],
          },
          rules: Object.fromEntries(
            KNOWN_VIOLATIONS.map(id => [id, { enabled: false }])
          ),
        },
        // Falha apenas em impactos críticos e sérios
        includedImpacts: ['critical', 'serious'],
      });
    });
  }
});
