const { chromium } = require('@playwright/test');
const { injectAxe, getViolations } = require('axe-playwright');
(async () => {
  const b = await chromium.launch();
  for (const p of ['/busca.html','/chat.html','/','/reservas.html','/resorts/hotbeach.html']) {
    const page = await b.newPage();
    await page.goto('http://localhost:4000'+p);
    await page.waitForLoadState('domcontentloaded');
    await injectAxe(page);
    const v = await getViolations(page, undefined, { runOnly:{type:'tag',values:['wcag2a','wcag2aa']}, rules:{'color-contrast':{enabled:false}} });
    const s = v.filter(x=>['critical','serious'].includes(x.impact));
    console.log('==',p, s.map(x=>x.id+' ['+x.impact+'] '+x.nodes.map(n=>n.target.join(' ')+' :: '+(n.failureSummary||'').replace(/\n/g,' | ')).join(' ;; ')).join('\n'));
    await page.close();
  }
  await b.close();
})();
