// Temporär: To-Do-Bereich im eingeloggten Zustand screenshotten
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file:///Users/wk/Developer/SellerHub/index.html');
await page.evaluate(() => {
  localStorage.setItem('sy_user', JSON.stringify({ id: 'u1', name: 'Wissam Kahil', username: 'wissam.kahil@gmail.com', email: 'wissam.kahil@gmail.com' }));
  localStorage.setItem('sy_token', 'fake-token-nur-optik');
});
await page.reload();
await page.waitForTimeout(1500);
await page.evaluate(() => { document.getElementById('wikaLoginOverlay')?.remove(); });
await page.waitForTimeout(400);
await page.evaluate(() => go('todo'));
await page.waitForTimeout(1500);
await page.screenshot({ path: '.claude/design-shots/todo-eingeloggt.png' });
// Zoom auf die obere linke Ecke (Sidebar-Kopf) und die To-Do-Toolbar
await page.screenshot({ path: '.claude/design-shots/todo-topleft.png', clip: { x: 0, y: 0, width: 700, height: 220 } });
await browser.close();
console.log('ok');
