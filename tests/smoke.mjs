// Smoke test: builds nothing itself; run after `npm run build`. It serves dist/, opens the
// game in a headless browser, and fails if the page throws an error or never draws.
// Run with `npm run smoke`.
import { preview } from 'vite';
import { chromium } from 'playwright';

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console error: ${m.text()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => errors.push('the game never drew a canvas'));
  await page.waitForTimeout(2000); // let a few frames render
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Smoke test passed: ${url} loaded and drew without errors.`);
} finally {
  await browser.close();
  server.httpServer.close();
}
