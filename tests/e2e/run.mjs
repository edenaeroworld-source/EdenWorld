#!/usr/bin/env node
/**
 * Executor dos testes de ponta a ponta do EDENWORLD.
 *
 *   npm run test:e2e                 → compila e testa o build de produção
 *   node tests/e2e/run.mjs celular   → só os cenários indicados
 *   EDEN_URL=http://localhost:5173/ node tests/e2e/run.mjs
 *                                    → testa um servidor que já está no ar
 *
 * Sem `EDEN_URL`, o executor serve a pasta `dist/` por conta própria
 * (equivalente a `npm run preview`) em uma porta livre.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCENARIOS = ['desktop', 'persistencia', 'celular', 'controle', 'robustez'];
/** Tempo máximo por cenário. A renderização por software (sem GPU) é lenta. */
const SCENARIO_TIMEOUT_MS = Number(process.env.EDEN_SCENARIO_TIMEOUT ?? 20 * 60_000);

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const unknown = requested.filter((name) => !SCENARIOS.includes(name));
if (unknown.length > 0) {
  console.error(`Cenário desconhecido: ${unknown.join(', ')}. Disponíveis: ${SCENARIOS.join(', ')}.`);
  process.exit(2);
}
const selected = requested.length > 0 ? SCENARIOS.filter((name) => requested.includes(name)) : SCENARIOS;

/** Sobe um servidor estático para `dist/` quando nenhum endereço foi informado. */
async function startOwnServer() {
  if (!existsSync(path.join(ROOT, 'dist/index.html'))) {
    throw new Error('A pasta dist/ não existe. Rode "npm run build" antes (ou use "npm run test:e2e", que já compila).');
  }
  const { preview } = await import('vite');
  const server = await preview({ root: ROOT, logLevel: 'error', preview: { host: '127.0.0.1', port: 4317, strictPort: false, open: false } });
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 4317;
  process.env.EDEN_URL = `http://127.0.0.1:${port}/`;
  return server;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`tempo esgotado (${Math.round(ms / 60_000)} min) em "${label}"`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let ownServer = null;
let exitCode = 0;
try {
  if (!process.env.EDEN_URL) ownServer = await startOwnServer();
  const { ARTIFACTS, Checks, assertServer, baseUrl, launch } = await import('./lib/harness.mjs');
  await assertServer();
  console.log(`EDENWORLD — testes de ponta a ponta\n  jogo: ${baseUrl()}${ownServer ? ' (build de produção, servidor próprio)' : ''}\n  capturas: ${ARTIFACTS}`);

  const results = [];
  for (const name of selected) {
    const scenario = await import(`./scenarios/${name}.mjs`);
    const checks = new Checks(scenario.title);
    const started = Date.now();
    console.log(`\n▶ ${scenario.title}`);
    let browser = null;
    try {
      // Um navegador por cenário: uma falha grave não contamina os demais.
      browser = await launch();
      await withTimeout(scenario.run(browser, checks), SCENARIO_TIMEOUT_MS, scenario.title);
    } catch (error) {
      const message = String(error?.message ?? error).split('\n').slice(0, 3).join(' — ');
      checks.failures.push(`interrompido: ${message}`);
      console.log(`    ✗ interrompido: ${message}`);
    } finally {
      await browser?.close().catch(() => {});
    }
    results.push({ name, title: scenario.title, passed: checks.passed, failures: checks.failures, seconds: (Date.now() - started) / 1000 });
  }

  console.log('\n──────── Resumo ────────');
  for (const result of results) {
    const mark = result.failures.length === 0 ? '✓' : '✗';
    console.log(`${mark} ${result.title} — ${result.passed} verificações ok, ${result.failures.length} falhas (${result.seconds.toFixed(0)} s)`);
    for (const failure of result.failures) console.log(`    ✗ ${failure}`);
  }
  const failed = results.reduce((sum, result) => sum + result.failures.length, 0);
  const passed = results.reduce((sum, result) => sum + result.passed, 0);
  console.log(`\n${failed === 0 ? 'SUCESSO' : 'FALHA'}: ${passed} verificações ok, ${failed} falhas em ${results.length} cenário(s).`);
  exitCode = failed === 0 ? 0 : 1;
} catch (error) {
  console.error(`\nNão foi possível executar os testes: ${error?.message ?? error}`);
  exitCode = 2;
} finally {
  await ownServer?.close().catch(() => {});
}
process.exit(exitCode);
