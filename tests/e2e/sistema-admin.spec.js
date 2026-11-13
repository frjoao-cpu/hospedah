// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('Sistema admin - guardas de markup', () => {
  async function lerSistemaHtml() {
    return fs.readFile(path.resolve(__dirname, '../../sistema.html'), 'utf8');
  }

  test('mantém ações críticas de login/nav sem onclick inline legado', async () => {
    const html = await lerSistemaHtml();
    const forbidden = [
      'onclick="tentarLogin()"',
      'onclick="enviarLinkMagico()"',
      'onclick="mostrarViewLogin()"',
      'onclick="enviarResetSenha()"',
      'onclick="definirNovaSenha()"',
      'onclick="toggleFloatCalc()"',
      'onclick="exportarBackup()"',
      'onclick="importarBackup()"',
      'onclick="fazerLogout()"',
      'onclick="toggleDashboard()"',
      'onclick="exportarDashboard()"',
    ];

    for (const marker of forbidden) {
      expect(html).not.toContain(marker);
    }
  });

  test('expõe data-actions para login, dashboard e caixa', async () => {
    const html = await lerSistemaHtml();
    const required = [
      'data-action="tentar-login"',
      'data-action="enviar-link-magico"',
      'data-action="mostrar-view-login"',
      'data-action="toggle-nav-dropdown"',
      'data-action="filtrar-periodo-dash"',
      'data-action="exportar-dashboard"',
      'data-action="exportar-csv-caixa"',
      'data-action="toggle-caixa"',
      'data-action="set-caixa-grafico-periodo"',
      'data-action="exportar-csv-fluxo-caixa"',
      'data-action="calc-action"',
    ];

    for (const marker of required) {
      expect(html).toContain(marker);
    }
  });

  test('inclui gráficos de funil e meta x projeção no dashboard analítico', async () => {
    const html = await lerSistemaHtml();
    expect(html).toContain('id="chartMetaProjecao"');
    expect(html).toContain('id="chartFunilConversao"');
    expect(html).toContain('id="funil-cv-1"');
    expect(html).toContain('id="funil-cv-2"');
    expect(html).toContain('id="funil-cv-3"');
  });
});
