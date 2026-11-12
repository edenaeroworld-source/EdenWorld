/**
 * Cenário: situações adversas.
 * Navegador sem WebGL2, armazenamento bloqueado, salvamento corrompido ou
 * adulterado, perda do contexto gráfico, limites do mundo e redimensionamento.
 */
import { ensurePlaying, makeSave, openGame, startNewGame } from '../lib/harness.mjs';

export const title = 'Robustez: falhas do navegador, dados inválidos e limites do mundo';

const OPTIONS = { query: 'quality=baixa&noaudio', width: 960, height: 540 };

export async function run(browser, t) {
  await t.step('navegador sem WebGL2', async () => {
    const g = await openGame(browser, {
      ...OPTIONS,
      waitReady: false,
      beforeLoad: (page) =>
        page.evaluateOnNewDocument(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
            return type === 'webgl2' ? null : original.call(this, type, ...rest);
          };
        }),
    });
    try {
      await g.waitVisible('.error-screen');
      t.equal(await g.text('.error-screen .panel__title'), 'Seu navegador não oferece WebGL2', 'tela de erro explica a falta de WebGL2');
      t.ok((await g.buttons()).includes('Tentar novamente'), 'a tela de erro oferece tentar novamente');
      const color = await g.page.evaluate(() => getComputedStyle(document.querySelector('.error-screen .panel__body p')).color);
      t.ok(color !== 'rgb(255, 255, 255)', `o texto da tela de erro é legível sobre o painel claro (${color})`);
      await g.shot('robustez-sem-webgl2');
      t.noErrors(g, 'sem exceções não tratadas ao faltar WebGL2');
    } finally {
      await g.close().catch(() => {});
    }
  });

  await t.step('armazenamento bloqueado pelo navegador', async () => {
    const g = await openGame(browser, {
      ...OPTIONS,
      beforeLoad: (page) =>
        page.evaluateOnNewDocument(() => {
          Storage.prototype.setItem = function () {
            throw new DOMException('bloqueado', 'SecurityError');
          };
        }),
    });
    try {
      await t.toast(g, 'bloqueou o salvamento', 'o jogador é avisado, já no menu, de que o progresso não será guardado');
      const s = await startNewGame(g);
      t.equal(s.mode, 'play', 'o jogo funciona mesmo sem armazenamento');
      await g.eden('save');
      t.equal(await g.savedData(), null, 'nada é gravado quando o armazenamento está bloqueado');
      t.noErrors(g, 'sem erros com o armazenamento bloqueado');
    } finally {
      await g.close().catch(() => {});
    }
  });

  await t.step('salvamento corrompido', async () => {
    const broken = '{"version":1,"profile":{"name":"Quebrado"';
    const g = await openGame(browser, { ...OPTIONS, save: broken });
    try {
      await t.toast(g, 'Não foi possível ler o salvamento', 'o jogador é avisado do problema');
      t.equal((await g.state()).mode, 'menu', 'o jogo abre normalmente com um salvamento ilegível');
      const buttons = await g.buttons();
      t.ok(buttons.includes('Jogar') && !buttons.includes('Continuar'), 'um novo jogo é oferecido');
      t.equal(await g.page.evaluate(() => localStorage.getItem('edenworld.save.v1.corrompido')), broken, 'o conteúdo ilegível é preservado em uma cópia de segurança');
      t.noErrors(g, 'sem erros com o salvamento corrompido');
    } finally {
      await g.close().catch(() => {});
    }
  });

  await t.step('salvamento adulterado', async () => {
    const dialogs = [];
    const tampered = JSON.stringify({
      version: 1,
      profile: { name: '<img src=x onerror=alert(1)>', created: true, appearance: { skin: 'javascript:alert(1)', hairStyle: 42, height: 1e9 } },
      player: { x: 1e12, y: -1e9, z: -1e12, heading: 'norte' },
      world: { hours: 99, day: -3 },
      progress: { crystals: ['cristal-praca', 'cristal-praca', 'cristal-que-nao-existe', '<script>', 7, null], entries: 'tudo', portals: ['portal-inventado'], wishes: -5, distance: 'muito' },
      settings: { audio: { master: 50 }, input: { keys: { jump: [123, ''] }, mouseSensitivity: 1e6 }, gameplay: { timePace: 'instantaneo' } },
    });
    const g = await openGame(browser, { ...OPTIONS, save: tampered, beforeLoad: async (page) => void page.on('dialog', (dialog) => (dialogs.push(dialog.message()), dialog.dismiss())) });
    try {
      await g.sleep(600);
      const welcome = (await g.text('.menu__welcome')) ?? '';
      t.ok(!welcome.includes('<') && !welcome.includes('>'), `o nome adulterado é exibido como texto limpo ("${welcome}")`);
      t.equal(await g.page.evaluate(() => document.querySelectorAll('#ui-root img[src="x"], #ui-root script').length), 0, 'nenhum elemento é injetado na página');
      await g.clickButton('Continuar');
      const s = await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'o jogo continua com os dados saneados');
      t.ok(Math.hypot(s.player.x, s.player.z - 30) < 3 && s.area === 'Praça Central', `a posição absurda é descartada e o jogador recomeça na praça (${s.player.x.toFixed(0)}, ${s.player.y.toFixed(1)}, ${s.player.z.toFixed(0)})`);
      t.equal(s.crystals, 1, 'itens repetidos, inválidos ou inexistentes são descartados do progresso');
      t.equal(s.portals, 1, 'portais que não existem no mapa são descartados');
      await g.waitFrames(6);
      const later = await g.state();
      t.ok(later.player.grounded || later.player.state === 'swim', `o personagem fica em um lugar jogável (${later.player.state})`);
      await g.eden('save');
      const data = await g.savedData();
      t.equal(data.settings.audio.master, 1, 'o volume fora da faixa é limitado');
      t.ok(data.settings.input.keys.jump.includes('Space'), 'teclas inválidas voltam ao padrão');
      t.equal(data.settings.gameplay.timePace, 'normal', 'opções desconhecidas voltam ao padrão');
      t.equal(dialogs.length, 0, 'nenhum código do salvamento é executado');
      t.noErrors(g, 'sem erros com o salvamento adulterado');
    } finally {
      await g.close().catch(() => {});
    }
  });

  await t.step('limites do mundo, "Voltar para a praça" e redimensionamento', async () => {
    const g = await openGame(browser, { ...OPTIONS, query: `${OPTIONS.query}&skipmenu`, save: makeSave() });
    try {
      // Nadar para fora do mapa: o jogador é contido pelo limite do mundo.
      await g.eden('teleport', 266, 0, Math.PI / 2);
      await g.waitState((s) => s.player.state === 'swim', 'nadando em mar aberto');
      await g.down('KeyW');
      await g.waitFrames(14);
      await g.up('KeyW');
      const edge = await g.state();
      const radius = Math.hypot(edge.player.x, edge.player.z);
      t.ok(radius <= 270, `o limite do mundo contém o jogador (raio ${radius.toFixed(1)} m)`);
      t.equal(edge.player.state, 'swim', 'o personagem nada em águas profundas');

      await g.press('Escape');
      await g.waitState((s) => s.modal === 'pausa', 'pausa');
      await g.clickButton('Voltar para a praça');
      const home = await t.reach(g, (s) => s.modal === null && s.gameplay && Math.hypot(s.player.x, s.player.z - 30) < 6, '"Voltar para a praça" leva o jogador ao ponto inicial', 60_000);
      t.equal(home.area, 'Praça Central', 'o jogador está de volta à Praça Central');

      // Girar o aparelho / redimensionar a janela.
      const wide = (await g.state()).camera.fov;
      await g.page.setViewport({ width: 420, height: 760 });
      await g.waitFrames(4);
      const tall = (await g.state()).camera.fov;
      t.ok(tall > wide + 5, `o campo de visão se adapta à tela em pé (${wide.toFixed(0)}° → ${tall.toFixed(0)}°)`);
      const canvas = await g.rect('#game-canvas');
      t.ok(Math.abs(canvas.width - 420) <= 1 && Math.abs(canvas.height - 760) <= 1, 'o canvas acompanha o novo tamanho da janela');
      t.ok(await g.fitsViewport(), 'a interface continua cabendo na tela');
      await g.page.setViewport({ width: 960, height: 540 });
      await g.waitFrames(3);
      t.noErrors(g, 'sem erros nos limites do mundo e ao redimensionar');
    } finally {
      await g.close().catch(() => {});
    }
  });

  await t.step('perda do contexto gráfico', async () => {
    const g = await openGame(browser, { ...OPTIONS, query: `${OPTIONS.query}&skipmenu`, save: makeSave() });
    try {
      await ensurePlaying(g);
      await g.eden('teleport', -30, 60, 0);
      await g.waitFrames(3);
      const lost = await g.page.evaluate(() => {
        const gl = document.getElementById('game-canvas').getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext();
        return true;
      });
      if (!lost) {
        console.log('    (extensão WEBGL_lose_context indisponível neste navegador: etapa ignorada)');
        return;
      }
      await g.waitVisible('.error-screen');
      t.equal(await g.text('.error-screen .panel__title'), 'Os gráficos foram interrompidos', 'o jogador é avisado quando o navegador derruba os gráficos');
      const data = await g.savedData();
      t.near(data.player.x, -30, 0.6, 'o progresso é gravado no momento da falha');
      await g.shot('robustez-contexto-perdido');
      t.ok(!g.errors.some((message) => message.startsWith('[pageerror]')), 'sem exceções não tratadas na perda de contexto');
    } finally {
      await g.close().catch(() => {});
    }
  });
}
