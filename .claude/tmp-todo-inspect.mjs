// Temporär: Element unter dem störenden W-Kästchen identifizieren
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///Users/wk/Developer/SellerHub/index.html');
await page.evaluate(() => {
  localStorage.setItem('sy_user', JSON.stringify({ id: 'u1', name: 'Wissam Kahil', username: 'wissam.kahil@gmail.com', email: 'wissam.kahil@gmail.com' }));
  localStorage.setItem('sy_token', 'fake-token-nur-optik');
});
await page.reload();
await page.waitForTimeout(1500);
await page.evaluate(() => { document.getElementById('wikaLoginOverlay')?.remove(); });
await page.evaluate(() => go('todo'));
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const hits = [];
  for (const [x, y] of [[262, 135], [255, 128], [268, 142]]) {
    const el = document.elementFromPoint(x, y);
    if (el) hits.push({ x, y, tag: el.tagName, cls: el.className, id: el.id, html: el.outerHTML.slice(0, 300), parent: el.parentElement?.outerHTML.slice(0, 300) });
  }
  return hits;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
