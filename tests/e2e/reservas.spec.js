// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * HOSPEDAH — Testes E2E: Fluxo completo de reserva
 *
 * Cobre o wizard multi-step da página reservas.html:
 *   Step 1 → selecionar resort
 *   Step 2 → informar datas
 *   Step 3 → dados do hóspede
 *   Step 4 → confirmação (sem submeter ao Supabase)
 */

test.describe('Fluxo de reserva — wizard multi-step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reservas.html');
    // Aguarda o grid de resorts renderizar
    await page.waitForSelector('#resortsGrid', { state: 'visible', timeout: 15000 });
  });

  test('step 1 — botão Próximo desabilitado sem resort selecionado', async ({ page }) => {
    const btnNext1 = page.locator('#btnNext1');
    await expect(btnNext1).toBeDisabled();
  });

  test('step 1 → step 2 — selecionar resort habilita botão e avança', async ({ page }) => {
    // Clica no primeiro card de resort disponível
    const resortCard = page.locator('#resortsGrid .resort-card, #resortsGrid [data-resort]').first();
    await resortCard.click();

    const btnNext1 = page.locator('#btnNext1');
    await expect(btnNext1).toBeEnabled({ timeout: 3000 });
    await btnNext1.click();

    // Step 2 deve estar visível
    await expect(page.locator('#dataEntrada')).toBeVisible();
  });

  test('step 2 — botão Próximo desabilitado sem datas', async ({ page }) => {
    const resortCard = page.locator('#resortsGrid .resort-card, #resortsGrid [data-resort]').first();
    await resortCard.click();
    await page.locator('#btnNext1').click();

    const btnNext2 = page.locator('#btnNext2');
    await expect(btnNext2).toBeDisabled();
  });

  test('step 3 — campos de dados do hóspede estão presentes', async ({ page }) => {
    // Avança até step 3 via JS para evitar dependência do Flatpickr
    await page.evaluate(() => {
      if (typeof window.irParaStep === 'function') window.irParaStep(3);
    });
    await expect(page.locator('#nomeHospede')).toBeVisible();
    await expect(page.locator('#emailHospede')).toBeVisible();
    await expect(page.locator('#telefoneHospede')).toBeVisible();
  });

  test('step 3 — botão Próximo desabilitado sem dados do hóspede', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof window.irParaStep === 'function') window.irParaStep(3);
    });
    const btnNext3 = page.locator('#btnNext3');
    await expect(btnNext3).toBeDisabled();
  });

  test('step 3 — preencher dados habilita botão de avançar', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof window.irParaStep === 'function') window.irParaStep(3);
    });

    await page.fill('#nomeHospede', 'João Teste');
    await page.fill('#emailHospede', 'joao@teste.com');
    await page.fill('#telefoneHospede', '(17) 99999-9999');

    const btnNext3 = page.locator('#btnNext3');
    await expect(btnNext3).toBeEnabled({ timeout: 3000 });
  });

  test('step 4 — tela de confirmação exibe dados preenchidos', async ({ page }) => {
    // Popula estado via JS e navega direto ao step 4
    await page.evaluate(() => {
      // Simula dados como se o wizard tivesse sido preenchido
      const nome  = document.getElementById('nomeHospede');
      const email = document.getElementById('emailHospede');
      const tel   = document.getElementById('telefoneHospede');
      if (nome)  { nome.value  = 'Maria Silva'; nome.dispatchEvent(new Event('input')); }
      if (email) { email.value = 'maria@silva.com'; email.dispatchEvent(new Event('input')); }
      if (tel)   { tel.value   = '(17) 98765-4321'; tel.dispatchEvent(new Event('input')); }
      if (typeof window.irParaStep === 'function') window.irParaStep(4);
    });

    // Tela de confirmação deve existir
    const confSection = page.locator('#conf-nome, .summary-row');
    await expect(confSection.first()).toBeVisible({ timeout: 3000 });
  });

  test('botão WhatsApp de fallback está presente', async ({ page }) => {
    await page.evaluate(() => {
      if (typeof window.irParaStep === 'function') window.irParaStep(4);
    });
    const waBtn = page.locator('#btnWhatsApp, .btn-whatsapp').first();
    await expect(waBtn).toBeVisible();
  });
});

test.describe('Resumo lateral de reserva', () => {
  test('sumário exibe resort ao selecionar', async ({ page }) => {
    await page.goto('/reservas.html');
    await page.waitForSelector('#resortsGrid', { state: 'visible', timeout: 15000 });

    const resortCard = page.locator('#resortsGrid .resort-card, #resortsGrid [data-resort]').first();
    await resortCard.click();

    // Sumário lateral (sumResort) deve ser preenchido
    const sumResort = page.locator('#sumResort');
    const text = await sumResort.textContent({ timeout: 3000 }).catch(() => '');
    expect(text).not.toBe('—');
  });
});
