import { createRequire } from 'node:module';
const req = createRequire('/tmp/chrome/noop.js');
const chromium = (await import(req.resolve('@sparticuz/chromium'))).default;
const puppeteer = await import('puppeteer-core');
const [modo, ...rest] = process.argv.slice(2);
const browser = await puppeteer.launch({
  args: [...chromium.args, '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: '/tmp/chromium', headless: 'shell', protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 760 });
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto(`${process.env.EDEN_URL ?? 'http://127.0.0.1:5173'}/lab.html`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction('window.eden !== undefined', { timeout: 120000 });
if (modo) await page.select('#modo', modo);
for (const kv of rest) { const [k, v] = kv.split('='); await page.evaluate((k, v) => { const el = document.getElementById(k); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, k, v); }
await page.click('#girar');
if (process.env.TWEAK) await page.evaluate((src) => new Function('eden', src)(window.eden), process.env.TWEAK);
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 14000)));
if (process.env.AFTER) await page.evaluate((src) => new Function('eden', src)(window.eden), process.env.AFTER);
console.log('GPU:', await page.$eval('#gpu', (e) => e.textContent));
if (process.env.PROBE) console.log('PROBE:', JSON.stringify(await page.evaluate((src) => new Function('eden', src)(window.eden), process.env.PROBE)));
await page.screenshot({ path: process.env.OUT ?? '.tmp-lab.png' });
console.log('ERROS:', erros.length ? erros.slice(0, 5).join(' | ') : 'nenhum');
await browser.close();
