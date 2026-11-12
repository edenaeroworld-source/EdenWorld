/**
 * Cenário: jogar apenas com um controle (gamepad).
 * Um controle simulado no layout padrão navega pelos menus, cria o avatar,
 * joga, usa o EdenPhone, remapeia um botão e é desconectado no meio do jogo.
 */
import { PAD, ensurePlaying, gamepad, installFakeGamepad, openGame } from '../lib/harness.mjs';

export const title = 'Controle: menus e jogo apenas com o gamepad';

export async function run(browser, t) {
  const g = await openGame(browser, { query: 'quality=baixa&noaudio', width: 960, height: 540, beforeLoad: installFakeGamepad });
  const pad = gamepad(g);
  try {
    await t.step('conexão e menu', async () => {
      await g.sleep(700);
      await pad.connect();
      await t.toast(g, 'Controle conectado', 'aviso de controle conectado, visível sobre o menu');
      const s = await g.state();
      t.ok(s.gamepad.connected && s.gamepad.standard, 'o controle é reconhecido com o layout padrão');
      await pad.press(PAD.DOWN);
      t.ok(['Configurações', 'Sobre'].includes(await g.focused()), 'o direcional move o foco no menu');
      t.equal((await g.state()).device, 'controle', 'o jogo passa a mostrar comandos de controle');
      await pad.press(PAD.UP);
      t.equal(await g.focused(), 'Jogar', 'o direcional volta para Jogar');
      await pad.press(PAD.A);
      await t.reach(g, (s) => s.mode === 'creator', 'A em Jogar abre o criador de avatar');
    });

    await t.step('criador de avatar pelo controle', async () => {
      await g.waitFrames(3);
      const start = JSON.stringify((await g.state()).appearance);
      t.ok(await g.visible('.pad-hint'), 'o criador mostra os atalhos do controle');
      const first = await g.focused();
      await pad.press(PAD.RB);
      const second = await g.focused();
      await pad.press(PAD.RB);
      const third = await g.focused();
      t.ok(first !== second && second !== third, `RB salta entre as seções do criador (${first} → ${second} → ${third})`);
      let changed = false;
      for (let i = 0; i < 4 && !changed; i++) {
        await pad.press(PAD.RIGHT);
        await pad.press(PAD.A);
        changed = JSON.stringify((await g.state()).appearance) !== start;
      }
      t.ok(changed, 'direcional + A escolhem uma opção de aparência');
      await g.shot('controle-criador');
      await pad.press(PAD.START);
      await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'Start confirma o avatar e entra no jogo');
      await g.waitFrames(3);
      t.ok(((await g.text('.hud__hints')) ?? '').includes('RT'), 'as dicas do HUD mostram os botões do controle');
    });

    await t.step('movimento e câmera', async () => {
      await ensurePlaying(g);
      const before = await g.state();
      await pad.axis(1, -1);
      await g.waitFrames(8);
      const walking = await g.state();
      const walked = Math.hypot(walking.player.x - before.player.x, walking.player.z - before.player.z);
      t.ok(walked > 0.4, `o analógico esquerdo move o personagem (${walked.toFixed(2)} m)`);
      await pad.set(PAD.RT, true);
      await g.waitFrames(8);
      t.equal((await g.state()).player.state, 'run', 'RT faz correr');
      await pad.set(PAD.RT, false);
      await pad.axis(1, 0);
      await t.reach(g, (s) => s.player.speed < 0.2, 'soltar o analógico para o personagem');

      const ground = await g.state();
      await pad.set(PAD.A, true);
      await g.waitFrames(2);
      const jumping = await g.state();
      await pad.set(PAD.A, false);
      t.ok(!jumping.player.grounded && jumping.player.y > ground.player.y + 0.15, 'A faz pular');
      await g.waitState((s) => s.player.grounded, 'aterrissou');

      const cam = (await g.state()).camera;
      await pad.axis(2, 1);
      await g.waitFrames(4);
      await pad.axis(2, 0);
      await pad.axis(3, -1);
      await g.waitFrames(4);
      await pad.axis(3, 0);
      const turned = (await g.state()).camera;
      t.ok(Math.abs(turned.yaw - cam.yaw) > 0.05 && Math.abs(turned.pitch - cam.pitch) > 0.02, 'o analógico direito gira a câmera nos dois eixos');
      await pad.set(PAD.RB, true);
      await g.waitFrames(4);
      await pad.set(PAD.RB, false);
      const zoomed = (await g.state()).camera;
      t.ok(Math.abs(zoomed.distance - turned.distance) > 0.1, 'LB/RB controlam o zoom');
    });

    await t.step('interação, EdenPhone e pausa', async () => {
      await ensurePlaying(g);
      await g.eden('teleport', 0, 9.5, Math.PI);
      await g.waitFrames(4);
      t.ok(((await g.text('.hud__prompt')) ?? '').startsWith('X'), 'o aviso de interação mostra o botão X do controle');
      await g.shot('controle-interagir');
      await pad.press(PAD.X);
      await t.toast(g, 'Esfera Aurora: modo', 'X interage com a Esfera Aurora');

      await pad.press(PAD.Y);
      await t.reach(g, (s) => s.modal === 'edenphone', 'Y abre o EdenPhone');
      const home = await g.focused();
      await pad.press(PAD.RIGHT);
      t.ok((await g.focused()) !== home, 'o direcional navega pelos aplicativos');
      await pad.press(PAD.LEFT);
      await pad.press(PAD.A);
      await g.waitFrames(2);
      t.equal(await g.text('.phone__app-head h2'), 'Mapa de Aurora City', 'A abre o aplicativo em foco');
      await pad.press(PAD.B);
      await g.waitFrames(1);
      t.equal((await g.state()).modal, 'edenphone', 'B volta para a tela inicial do EdenPhone');
      await pad.press(PAD.B);
      await t.reach(g, (s) => s.modal === null, 'B de novo guarda o EdenPhone');

      await pad.press(PAD.START);
      await t.reach(g, (s) => s.modal === 'pausa', 'Start pausa o jogo');
      t.equal(await g.focused(), 'Continuar', 'o foco da pausa começa em Continuar');
      await pad.press(PAD.DOWN);
      t.equal(await g.focused(), 'Configurações', 'direcional para baixo vai a Configurações');
      await pad.press(PAD.A);
      await t.reach(g, (s) => s.modal === 'configuracoes', 'A abre as configurações');
      const tabs = [await g.text('.tab.is-active')];
      for (let i = 0; i < 3; i++) {
        await pad.press(PAD.RB);
        tabs.push(await g.text('.tab.is-active'));
      }
      t.equal(tabs.join(' > '), 'Gráficos > Áudio > Teclado e toque > Controle', 'RB percorre as abas');
      await pad.set(PAD.X, true);
      await pad.axis(0, 0.8);
      await g.waitFrames(3);
      t.ok(((await g.text('.pad-status')) ?? '').startsWith('Controle conectado'), 'a aba Controle mostra o controle conectado');
      t.ok(await g.page.evaluate(() => document.querySelectorAll('.pad-test__buttons .is-on').length >= 1), 'o teste de botões acende ao apertar');
      await g.shot('controle-configuracoes');
      await pad.set(PAD.X, false);
      await pad.axis(0, 0);
      await g.waitFrames(2);
    });

    await t.step('remapear um botão', async () => {
      // Desce até o botão de "Pular" (A) e troca por LB.
      let found = false;
      for (let i = 0; i < 24 && !found; i++) {
        await pad.press(PAD.DOWN);
        found = ((await g.focused()) ?? '').startsWith('A /');
      }
      t.ok(found, 'o direcional alcança a lista de botões');
      await pad.press(PAD.A);
      await g.waitFrames(2);
      t.equal(await g.text('.bind-key.is-listening'), 'Pressione um botão…', 'A inicia a captura do novo botão');
      await pad.press(PAD.LB);
      await g.waitFrames(2);
      t.ok(((await g.focused()) ?? '').startsWith('LB'), 'o botão capturado aparece e mantém o foco');
      await pad.press(PAD.B);
      await t.reach(g, (s) => s.modal === 'pausa', 'B fecha as configurações');
      await pad.press(PAD.START);
      await t.reach(g, (s) => s.modal === null && s.gameplay, 'Start retoma o jogo');
      const ground = await g.state();
      await pad.set(PAD.LB, true);
      await g.waitFrames(2);
      const jumping = await g.state();
      await pad.set(PAD.LB, false);
      t.ok(!jumping.player.grounded || jumping.player.y > ground.player.y + 0.15, 'LB agora faz pular');
      await g.waitState((s) => s.player.grounded, 'aterrissou');
      await g.eden('save');
      t.equal((await g.savedData()).settings.input.pad.jump, PAD.LB, 'o remapeamento fica salvo');
    });

    await t.step('vibração e desconexão', async () => {
      await ensurePlaying(g);
      const [crystal] = await g.eden('collectibles');
      const before = await pad.vibrations();
      await g.eden('teleport', crystal.x, crystal.z, 0);
      await g.waitState((s) => s.crystals === 1, 'cristal coletado');
      await g.waitFrames(2);
      t.ok((await pad.vibrations()) > before, 'coletar um cristal aciona a vibração do controle');
      await pad.disconnect();
      await t.toast(g, 'Controle desconectado', 'aviso de controle desconectado');
      await t.reach(g, (s) => s.modal === 'pausa', 'desconectar o controle pausa o jogo');
      t.equal((await g.state()).gamepad.connected, false, 'o jogo registra a desconexão');
      await g.shot('controle-desconectado');
      t.noErrors(g);
    });
  } finally {
    await g.close().catch(() => {});
  }
}
