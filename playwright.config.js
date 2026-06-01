// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * HOSPEDAH — Configuração do Playwright E2E
 *
 * Testes rodam contra um servidor local (npx serve) ou contra
 * a URL de produção definida em HOSPEDAH_BASE_URL.
 *
 * Variáveis de ambiente:
 *   HOSPEDAH_BASE_URL   URL base (padrão: http://localhost:4000)
 *   CI                  Se definida, configura comportamento para CI
 */

const BASE_URL = process.env.HOSPEDAH_BASE_URL || 'http://localhost:4000';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.HOSPEDAH_BASE_URL
    ? undefined
    : {
        command: 'npx serve . -p 4000 -s',
        url: 'http://localhost:4000',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
