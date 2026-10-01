/*
  Renders the ad to MP4, frame by frame.

    cd ad && npm install && npm run render
    node render.mjs --samples 8 --out out/sachukardi-ad-16x9.mp4
    node render.mjs --format 9x16            (vertical, Instagram Reels)

  Starts a Vite dev server on the site root (so /images and /fonts resolve),
  opens ad/index.html?render in headless Chrome, seeks every frame and pipes
  the screenshots into ffmpeg (H.264, yuv420p — plays everywhere, uploads to
  Meta/YouTube/LinkedIn as-is). Also saves the last frame as a PNG.
*/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const SAMPLES = Number(arg('samples', 8));
const FORMAT = arg('format', '16x9'); // 16x9 (1920×1080) or 9x16 (1080×1920, Reels)
const [VW, VH] = FORMAT === '9x16' ? [1080, 1920] : [1920, 1080];
const OUT = resolve(here, arg('out', `out/sachukardi-ad-${FORMAT}.mp4`));
const FROM = Number(arg('from', 0));
const TO = arg('to');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chrome/Edge found — set the path in render.mjs');

mkdirSync(dirname(OUT), { recursive: true });
// encode to a private temp file and move it into place only when complete, so
// a half-written video can never be opened (or clobbered by another render)
const TMP = OUT.replace(/\.mp4$/, `.rendering-${process.pid}.mp4`);

const server = await createServer({ root: resolve(here, '..'), server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', '--force-color-profile=srgb'],
  defaultViewport: { width: VW, height: VH, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}ad/index.html?render&samples=${SAMPLES}&format=${FORMAT}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__ready);
  const { duration, fps } = await page.evaluate(() => window.__meta);
  const gl = await page.evaluate(() => {
    const g = document.getElementById('gl').getContext('webgl2');
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`GPU: ${gl}`);

  const first = Math.round(FROM * fps);
  const last = Math.round((TO ? Number(TO) : duration) * fps);
  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    TMP,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));

  const started = Date.now();
  let png;
  for (let f = first; f < last; f++) {
    await page.evaluate((t) => window.__seek(t), f / fps);
    png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: VW, height: VH } });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - first) % 30 === 0) {
      const per = (Date.now() - started) / (f - first + 1);
      process.stdout.write(`\rframe ${f + 1}/${last}  ${(per / 1000).toFixed(2)} s/frame  `);
    }
  }
  ff.stdin.end();
  await done;
  let final = OUT;
  try {
    renameSync(TMP, OUT);
  } catch {
    final = TMP; // the old file is open in a video player; keep the new one under its temp name
    console.log(`\n${OUT} is in use (close the video player), so the new video was kept as:`);
  }
  writeFileSync(OUT.replace(/\.mp4$/, '-last-frame.png'), png);
  console.log(`\nwrote ${final} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
} catch (e) {
  rmSync(TMP, { force: true });
  throw e;
} finally {
  await browser.close();
  await server.close();
}
