// @ts-check
/* eslint-disable no-undef */
const { test, expect } = require('@playwright/test');

test.describe('Homepage redesign integrations', () => {
  test('exibe seção de transparência do HOSPEDAH Score', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#como-funciona-score')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Como funciona o HOSPEDAH Score/i })).toBeVisible();
  });

  test('exibe filtros de busca de cota e oportunidades', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#cotaDestino')).toBeVisible();
    await expect(page.locator('#cotaDormitorios')).toBeVisible();
    await expect(page.locator('#cotaSemanas')).toBeVisible();
    await expect(page.locator('#cotaTemporada')).toBeVisible();
    await expect(page.locator('#oportunidades')).toBeVisible();
  });

  test('calculadora usa campo de diária e percentual dinâmico', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#diaria')).toBeVisible();
    await expect(page.locator('#economiaPercent')).toHaveText('20%');
    await page.locator('#diaria').fill('1000');
    await page.locator('#calc_noites').fill('2');
    await expect(page.locator('#calcEconomia')).toHaveText('R$ 400,00');
    await expect(page.locator('#calcHospedah')).toHaveText('R$ 1.600,00');
  });

  test('busca de hospedagem redireciona para reservas com querystring', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      /** @type {string} */
      let redirected = '';
      const tracked = [];
      // @ts-ignore
      window.navigateTo = (url) => { redirected = String(url || ''); };
      // @ts-ignore
      window.gtag = (...args) => tracked.push(args);

      document.getElementById('destinoHospedagem').value = 'hotbeach';
      document.getElementById('checkin').value = '2026-10-10';
      document.getElementById('checkout').value = '2026-10-13';
      document.getElementById('pessoas').value = '3';
      document.getElementById('clienteNome').value = 'Cliente Teste';
      document.getElementById('clienteContato').value = '17999999999';
      document.getElementById('clienteObs').value = 'Prefiro andar alto';
      buscarHospedagem();
      return { redirected, tracked };
    });

    const redirectedUrl = result.redirected;
    expect(redirectedUrl).toContain('reservas.html?');
    expect(redirectedUrl).toContain('resort=hotbeach');
    expect(redirectedUrl).toContain('entrada=2026-10-10');
    expect(redirectedUrl).toContain('saida=2026-10-13');
    expect(redirectedUrl).toContain('hospedes=3');
    expect(redirectedUrl).toContain('nome=Cliente+Teste');
    expect(redirectedUrl).toContain('contato=17999999999');
    expect(redirectedUrl).toContain('obs=Prefiro+andar+alto');
    expect(result.tracked.some((evt) => evt[1] === 'busca')).toBeTruthy();
  });

  test('menu mobile alterna estado de abertura', async ({ page }) => {
    await page.goto('/');
    const aberto = await page.evaluate(() => {
      toggleMenu();
      const menu = document.getElementById('mainNav');
      const btn = document.getElementById('hamburger');
      return {
        expanded: btn ? btn.getAttribute('aria-expanded') : null,
        navOpen: menu ? menu.classList.contains('nav-open') : false
      };
    });
    expect(aberto.expanded).toBe('true');
    expect(aberto.navOpen).toBeTruthy();

    const fechado = await page.evaluate(() => {
      const firstLink = document.querySelector('#mainNav a');
      if (firstLink) firstLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const btn = document.getElementById('hamburger');
      return btn ? btn.getAttribute('aria-expanded') : null;
    });
    expect(fechado).toBe('false');
  });

  test('cta da HOSPEDAH IA abre chat.html', async ({ page }) => {
    await page.goto('/');
    const openedUrl = await page.evaluate(() => {
      /** @type {string} */
      let captured = '';
      const originalOpen = window.open;
      // @ts-ignore
      window.open = (url) => { captured = String(url || ''); return null; };
      const btn = Array.from(document.querySelectorAll('button')).find((el) =>
        (el.textContent || '').includes('Conversar com a HOSPEDAH IA')
      );
      if (btn) btn.click();
      window.open = originalOpen;
      return captured;
    });
    expect(openedUrl).toContain('chat.html');
  });
});
