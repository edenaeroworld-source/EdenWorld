/**
 * Captura uma cena da bancada (`lab.html`) em WebGL 2.0 de verdade.
 *
 * Não é um teste: é o instrumento com que se olha para o personagem.
 * Nenhum rasterizador de teste, nenhum mock — o mesmo caminho de
 * render do jogo, com o `Environment` original, saindo em PNG.
 *
 * ## Provisionamento (uma vez por máquina)
 *
 * O Chromium não vem no repositório. Ele é baixado pelo pacote
 * `@sparticuz/chromium`, instalado FORA do projeto para não entrar no
 * `package.json`, e as bibliotecas compartilhadas de que ele precisa
 * (NSPR, NSS, expat) saem do mesmo pacote:
 *
 * ```sh
 * mkdir -p /tmp/chrome && cd /tmp/chrome && npm init -y && npm i @sparticuz/chromium
 * node -e "const m=require('@sparticuz/chromium');(m.default??m).executablePath()" # extrai /tmp/chromium
 * mkdir -p /tmp/al2023 && node -e "const f=require('fs'),z=require('zlib');\
 *   f.writeFileSync('/tmp/al2023.tar', z.brotliDecompressSync(\
 *   f.readFileSync('/tmp/chrome/node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
 * tar -xf /tmp/al2023.tar -C /tmp/al2023
 * ```
 *
 * ## Uso
 *
 * Com `npm run dev` no ar, a partir da raiz do repositório:
 *
 * ```sh
 * LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp OUT=docs/validacao/x.png \
 *   [TWEAK='eden.olhar(0.3)'] [PROBE='return eden.fps'] [WAIT=14000] \
 *   node tools/captura.mjs <modo> [controle=valor ...]
 * ```
 *
 * - `<modo>` é o valor do seletor de cena: `corpo`, `rosto`, `bichos`,
 *   `niveis`, `elenco`, `bet`.
 * - `controle=valor` mexe em qualquer `<input>`/`<select>` do painel
 *   pelo id: `nivel=baixa`, `bust=2.5`, `roupa=casual`, `hora=22`.
 * - `TWEAK` é JavaScript avaliado na página depois de montar a cena,
 *   com `eden` disponível; é por onde se trava o ângulo da câmera.
 * - `PROBE` é o corpo de uma função avaliada no fim; o retorno é
 *   impresso. Serve para ler FPS, custo de construção ou contagens.
 *
 * ## Duas armadilhas que custaram tempo
 *
 * O script precisa rodar de dentro do repositório, senão não acha
 * `puppeteer-core`. E `ligar()` na bancada escuta `input`, não
 * `change`: despachar só `change` não faz nada, e a varredura de
 * níveis devolve quatro linhas idênticas sem ninguém perceber.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// O Chromium vive fora do projeto, para não virar dependência dele.
const requireTmp = createRequire('/tmp/chrome/noop.js');
const puppeteer = require('puppeteer-core');
const chromiumModule = requireTmp('@sparticuz/chromium');
const chromium = chromiumModule.default ?? chromiumModule;

const [modo, ...pares] = process.argv.slice(2);
if (!modo || !process.env.OUT) {
  console.error('uso: OUT=arquivo.png node tools/captura.mjs <modo> [controle=valor ...]');
  process.exit(1);
}

const navegador = await puppeteer.launch({
  args: [...chromium.args, '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: await chromium.executablePath(),
  headless: 'shell',
  protocolTimeout: 300000,
});

const pagina = await navegador.newPage();
await pagina.setViewport({ width: Number(process.env.W || 1100), height: Number(process.env.H || 760) });

const erros = [];
pagina.on('pageerror', (e) => erros.push(String(e)));
pagina.on('console', (m) => {
  if (m.type() === 'error') erros.push(m.text());
});

await pagina.goto('http://localhost:5173/lab.html', { waitUntil: 'networkidle0', timeout: 120000 });
await pagina.waitForFunction('window.eden && window.eden.montar', { timeout: 120000 });

/** Mexe num controle do painel disparando os dois eventos que a bancada pode escutar. */
const ajustar = (id, valor) =>
  pagina.evaluate(
    (id, valor) => {
      const alvo = document.querySelector(`#${id}`);
      if (!alvo) throw new Error(`controle inexistente: #${id}`);
      alvo.value = valor;
      alvo.dispatchEvent(new Event('input'));
      alvo.dispatchEvent(new Event('change'));
    },
    id,
    valor,
  );

await ajustar('modo', modo);
for (const par of pares) {
  const [id, valor] = par.split('=');
  await ajustar(id, valor);
}

// A órbita começa ligada: parar é o que permite comparar dois renders.
await pagina.click('#girar');
await new Promise((r) => setTimeout(r, 2000));
if (process.env.TWEAK) await pagina.evaluate(process.env.TWEAK);

await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 14000)));

const gpu = await pagina.evaluate(() => document.querySelector('#gpu')?.textContent ?? '');
console.log('GPU:', gpu.slice(0, 110));
console.log('ERROS:', erros.length ? erros.join(' | ') : 'nenhum');
if (process.env.PROBE) {
  // eslint-disable-next-line no-new-func
  console.log('PROBE:', JSON.stringify(await pagina.evaluate(new Function(process.env.PROBE))));
}

await pagina.screenshot({ path: process.env.OUT });
await navegador.close();

// Uma captura com erro de página é pior que nenhuma: o PNG existe, parece
// uma captura, e mostra um avatar que não compilou. Falhar aqui foi o que
// pegou `edenBandSlope` apagado do GLSL — o shader não compilava e as três
// capturas anteriores tinham sido aceitas como boas.
if (erros.length && process.env.IGNORAR_ERROS !== '1') process.exit(1);
