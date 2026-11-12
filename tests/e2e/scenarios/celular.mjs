/**
 * Cenário: celular com tela de toque, em retrato e em paisagem.
 * Usa toques reais (analógico virtual, arrastar, botões) e confere que a
 * interface cabe na tela e que os alvos de toque têm tamanho confortável.
 */
import { ensurePlaying, openGame } from '../lib/harness.mjs';

export const title = 'Celular: tela de toque em retrato e paisagem';

const intersects = (a, b) => Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function playOnPhone(browser, t, { label, width, height }) {
  const g = await openGame(browser, { query: 'quality=baixa&noaudio', width, height, touch: true, dpr: 2 });
  const touch = g.page.touchscreen;
  const inside = (r) => Boolean(r) && r.left >= -1 && r.top >= -1 && r.right <= width + 1 && r.bottom <= height + 1;
  try {
    await t.step(`${label}: menu e criador de avatar`, async () => {
      const s = await g.state();
      t.equal(s.device, 'toque', `${label}: o jogo reconhece a tela de toque`);
      await g.sleep(900);
      t.ok(await g.fitsViewport(), `${label}: o menu cabe na tela, sem rolagem`);
      const layout = await g.page.evaluate(() => {
        const bottom = Math.max(...[...document.querySelectorAll('.menu button')].map((el) => el.getBoundingClientRect().bottom));
        return { bottom, foot: document.querySelector('.menu__foot').getBoundingClientRect().top };
      });
      t.ok(layout.bottom <= layout.foot, `${label}: os botões do menu não cobrem o rodapé`);
      await g.shot(`celular-${label}-menu`);
      await g.tapButton('Jogar');
      await t.reach(g, (s) => s.mode === 'creator', `${label}: tocar em Jogar abre o criador`);
      await g.waitFrames(3);
      t.ok(inside(await (await g.findButton('Entrar em Aurora City')).boundingBox().then((b) => ({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height }))), `${label}: o botão de confirmar fica visível sem rolar`);
      await g.shot(`celular-${label}-criador`);
      await g.tapButton('Aleatório');
      await g.tapButton('Entrar em Aurora City');
      await t.reach(g, (s) => s.mode === 'play' && s.modal === null, `${label}: o toque em confirmar entra em Aurora City`);
    });

    await t.step(`${label}: controles de toque`, async () => {
      await g.waitFrames(3);
      t.ok((await g.visible('.touch-stick')) && (await g.visible('.touch-btn--jump')), `${label}: analógico virtual e botão de pulo aparecem`);
      const targets = await g.page.evaluate(() =>
        [...document.querySelectorAll('.touch-btn, .hud__btn')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .map((r) => Math.round(Math.min(r.width, r.height))),
      );
      t.ok(targets.length >= 4 && targets.every((size) => size >= 44), `${label}: alvos de toque com 44 px ou mais (${targets.join(', ')})`);
      for (const selector of ['.hud__corner--tl', '.hud__corner--tr', '.touch-btn--jump', '.touch-btn--run']) {
        t.ok(inside(await g.rect(selector)), `${label}: ${selector} está dentro da tela`);
      }

      // Analógico virtual: o toque nasce no lado esquerdo e é arrastado para cima.
      const before = await g.state();
      const sx = Math.round(width * 0.2);
      const sy = Math.round(height * 0.8);
      const finger = await touch.touchStart(sx, sy);
      await g.waitFrames(1);
      await finger.move(sx, sy - 30);
      await finger.move(sx, sy - 70);
      await g.waitFrames(8);
      const moving = await g.state();
      await g.shot(`celular-${label}-andando`);
      await finger.end();
      const walked = Math.hypot(moving.player.x - before.player.x, moving.player.z - before.player.z);
      t.ok(walked > 0.4, `${label}: o analógico virtual move o personagem (${walked.toFixed(2)} m)`);
      await t.reach(g, (s) => s.player.speed < 0.2, `${label}: soltar o analógico para o personagem`);
      t.equal(await g.page.evaluate(() => document.querySelector('.touch-stick').classList.contains('is-active')), false, `${label}: o analógico volta à posição de descanso`);

      // Arrastar no lado direito gira a câmera.
      const cam = (await g.state()).camera;
      const lx = Math.round(width * 0.72);
      const ly = Math.round(height * 0.4);
      const look = await touch.touchStart(lx, ly);
      await g.waitFrames(1);
      for (let i = 1; i <= 5; i++) await look.move(lx + i * 16, ly + i * 4);
      await g.waitFrames(2);
      await look.end();
      const turned = (await g.state()).camera;
      t.ok(Math.abs(turned.yaw - cam.yaw) > 0.05, `${label}: arrastar na tela gira a câmera (${cam.yaw.toFixed(2)} → ${turned.yaw.toFixed(2)})`);

      // Botão de pulo.
      const ground = await g.state();
      const box = await (await g.findButton('Pular')).boundingBox();
      const jump = await touch.touchStart(box.x + box.width / 2, box.y + box.height / 2);
      await g.waitFrames(2);
      const jumping = await g.state();
      await jump.end();
      t.ok(!jumping.player.grounded && jumping.player.y > ground.player.y + 0.15, `${label}: o botão de pulo faz pular`);
      await g.waitState((s) => s.player.grounded, 'aterrissou');

      // Botão de correr (alterna).
      await g.tapButton('Correr');
      await g.waitFrames(1);
      t.equal(await g.page.evaluate(() => document.querySelector('.touch-btn--run').getAttribute('aria-pressed')), 'true', `${label}: o botão de correr liga com um toque`);
      await g.tapButton('Correr');
    });

    await t.step(`${label}: interagir, EdenPhone e pausa`, async () => {
      await ensurePlaying(g);
      await g.eden('teleport', 0, 9.5, Math.PI);
      await g.waitFrames(4);
      t.equal((await g.state()).target, 'esfera-aurora', `${label}: a Esfera Aurora vira o alvo ao chegar perto`);
      t.ok(await g.visible('.touch-btn--interact'), `${label}: o botão de interação aparece perto da Esfera`);
      const prompt = await g.rect('.hud__prompt');
      t.ok(inside(prompt), `${label}: o aviso de interação está dentro da tela`);
      t.ok(!intersects(prompt, await g.rect('.touch-btn--jump')) && !intersects(prompt, await g.rect('.touch-btn--interact')), `${label}: o aviso não fica sob os botões de toque`);
      await g.shot(`celular-${label}-interagir`);
      await g.tap('.touch-btn--interact');
      await t.toast(g, 'Esfera Aurora: modo', `${label}: o botão de interação aciona a Esfera`);
      t.ok(inside(await g.rect('.toast:last-child')), `${label}: o aviso temporário cabe na tela`);

      await g.tapButton('Abrir EdenPhone');
      await t.reach(g, (s) => s.modal === 'edenphone', `${label}: o botão do HUD abre o EdenPhone`);
      await g.waitFrames(2);
      t.ok(inside(await g.rect('.phone')), `${label}: o EdenPhone cabe na tela`);
      t.ok(!(await g.visible('.touch-stick')), `${label}: os controles de toque somem com o EdenPhone aberto`);
      await g.shot(`celular-${label}-edenphone`);
      await g.tapButton('Mapa');
      await g.waitFrames(2);
      t.equal(await g.text('.phone__app-head h2'), 'Mapa de Aurora City', `${label}: o Mapa abre com um toque`);
      await g.shot(`celular-${label}-mapa`);
      await g.tapButton('Guardar');
      await t.reach(g, (s) => s.modal === null, `${label}: Guardar fecha o EdenPhone`);

      await g.tapButton('Pausar e abrir o menu');
      await t.reach(g, (s) => s.modal === 'pausa', `${label}: o botão do HUD pausa o jogo`);
      await g.tapButton('Configurações');
      await g.waitFrames(2);
      t.ok(inside(await g.rect('.screen:last-child .panel')), `${label}: as configurações cabem na tela`);
      t.ok(inside(await (await g.findButton('Concluir')).boundingBox().then((b) => ({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height }))), `${label}: o botão Concluir fica visível`);
      await g.shot(`celular-${label}-configuracoes`);
      await g.tapButton('Concluir');
      await g.tapButton('Continuar');
      await t.reach(g, (s) => s.modal === null && s.gameplay, `${label}: Continuar retoma o jogo`);
      t.ok(await g.visible('.touch-stick'), `${label}: os controles de toque voltam ao retomar`);
      t.ok(await g.fitsViewport(), `${label}: nada vaza para fora da tela durante o jogo`);
      t.noErrors(g, `${label}: sem erros no console`);
    });
  } finally {
    await g.close().catch(() => {});
  }
}

export async function run(browser, t) {
  await playOnPhone(browser, t, { label: 'retrato', width: 390, height: 844 });
  await playOnPhone(browser, t, { label: 'paisagem', width: 844, height: 390 });
}
