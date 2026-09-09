// @ts-check
const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('Sistema - captação', () => {
  async function lerSistemaHtml() {
    return fs.readFile(path.resolve(__dirname, '../../sistema.html'), 'utf8');
  }

  test('remove campo de período da captação e mantém cota', async () => {
    const html = await lerSistemaHtml();

    expect(html).not.toContain('id="cap_periodo"');
    expect(html).not.toContain('id="editCap_periodo"');
    expect(html).toContain('id="cap_cota"');
    expect(html).toContain('id="editCap_cota"');
    expect(html).not.toContain("document.getElementById('cap_periodo')");
    expect(html).not.toContain("document.getElementById('editCap_periodo')");
    expect(html).not.toContain("c.periodo || ''");
  });

  test('mantém botões Limpar/Atualizar apontando para funções existentes', async () => {
    const html = await lerSistemaHtml();
    const expectedHandlers = [
      'limparFormCaptacao',
      'carregarReservasHospede',
      'carregarAvaliacoesMod',
      'carregarMensagens',
      'carregarVisitasSite',
      'carregarFidelidadeAdmin',
      'carregarAiConfig',
      'renderAlertasPagamentoCaptacao'
    ];

    for (const handler of expectedHandlers) {
      expect(html).toContain(`onclick="${handler}()"`);
      expect(html).toMatch(new RegExp(`function\\s+${handler}\\s*\\(`));
    }
  });
});
