/*
  Captures single frames of the ad at given times, for quick review.

    node stills.mjs 1.3 3.7 8.1          → out/stills/t01.30.png …
    node stills.mjs --samples 4 12.5
*/
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const si = args.indexOf('--samples');
const SAMPLES = si > -1 ? Number(args.splice(si, 2)[1]) : 2;
const fi = args.indexOf('--format');
const FORMAT = fi > -1 ? args.splice(fi, 2)[1] : '16x9';
const [VW, VH] = FORMAT === '9x16' ? [1080, 1920] : [1920, 1080];
const times = args.map(Number).filter((n) => !Number.isNaN(n));
if (!times.length) throw new Error('usage: node stills.mjs <seconds> …');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));

const outDir = resolve(here, 'out/stills');
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: resolve(here, '..'), server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: VW, height: VH, deviceScaleFactor: 1 },
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${server.resolvedUrls.local[0]}ad/index.html?render&samples=${SAMPLES}&format=${FORMAT}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);
  for (const t of times) {
    await page.evaluate((s) => window.__seek(s), t);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: VW, height: VH } });
    const file = resolve(outDir, `t${t.toFixed(2).padStart(5, '0')}.png`);
    writeFileSync(file, png);
    console.log(file);
  }
} finally {
  await browser.close();
  await server.close();
}
