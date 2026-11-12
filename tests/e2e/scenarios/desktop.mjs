/**
 * Cenário: computador com teclado e mouse.
 * Percorre o caminho de um jogador novo: menu → criador de avatar → Aurora
 * City → movimento → interações → EdenPhone → configurações → foto.
 */
import { approach, ensurePlaying, openGame } from '../lib/harness.mjs';

export const title = 'Computador: do menu ao jogo com teclado e mouse';

export async function run(browser, t) {
  // Áudio ligado de propósito: confere que ele só inicia após um gesto do jogador.
  const g = await openGame(browser, { query: 'quality=baixa', width: 960, height: 540 });
  try {
    await t.step('menu principal', async () => {
      const s = await g.state();
      t.equal(s.mode, 'menu', 'o jogo abre no menu principal');
      t.equal(s.audio, false, 'o áudio fica bloqueado até um gesto do jogador');
      const buttons = await g.buttons();
      t.ok(['Jogar', 'Configurações', 'Sobre'].every((label) => buttons.includes(label)), `menu oferece Jogar, Configurações e Sobre (${buttons.join(', ')})`);
      t.ok(!buttons.includes('Continuar'), 'sem salvamento, não há botão Continuar');
      t.equal(await g.focused(), 'Jogar', 'o foco inicial está em Jogar');
      await g.clickButton('Sobre');
      await t.reach(g, (s) => s.modal === 'sobre', 'o botão Sobre abre o diálogo');
      t.ok(((await g.text('.screen:last-child .panel__body')) ?? '').length > 40, 'o diálogo Sobre tem conteúdo');
      await g.press('Escape');
      await t.reach(g, (s) => s.modal === 'menu', 'Esc fecha o diálogo Sobre');
    });

    await t.step('criador de avatar', async () => {
      await g.clickButton('Jogar');
      const s = await t.reach(g, (s) => s.mode === 'creator', 'Jogar abre o criador de avatar');
      await g.page.type('.text-input', '  Lia <b>Aero</b>  ');
      let changed = false;
      for (let i = 0; i < 4 && !changed; i++) {
        await g.clickButton('Aleatório');
        await g.waitFrames(2);
        changed = JSON.stringify((await g.state()).appearance) !== JSON.stringify(s.appearance);
      }
      t.ok(changed, 'o botão Aleatório muda a aparência do avatar');
      await g.shot('desktop-criador');
      await g.clickButton('Entrar em Aurora City');
      const play = await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'o botão de confirmar entra em Aurora City');
      t.equal(play.name, 'Lia bAero/b', 'o nome é limpo de marcação e espaços extras');
      t.equal(play.audio, true, 'o áudio é liberado depois do primeiro gesto');
      t.equal(play.area, 'Praça Central', 'o jogador começa na Praça Central');
      t.ok(play.gameplay, 'os controles do jogo estão ativos');
      await t.toast(g, 'Lia', 'aviso de boas-vindas com o nome do jogador');
      t.ok(await g.visible('.hud__corner--tl'), 'o HUD aparece ao entrar no jogo');
    });

    await t.step('movimento: andar, correr e pular', async () => {
      await ensurePlaying(g);
      const start = await g.state();
      await g.down('KeyW');
      await g.waitFrames(8);
      const walking = await g.state();
      const walked = Math.hypot(walking.player.x - start.player.x, walking.player.z - start.player.z);
      t.ok(walked > 0.4, `W move o personagem (${walked.toFixed(2)} m)`);
      t.equal(walking.player.state, 'walk', 'estado "andando" enquanto W está pressionado');
      await g.down('ShiftLeft');
      await g.waitFrames(8);
      const running = await g.state();
      t.equal(running.player.state, 'run', 'Shift faz o personagem correr');
      t.ok(running.player.speed > walking.player.speed + 0.5, `correr é mais rápido que andar (${walking.player.speed.toFixed(1)} → ${running.player.speed.toFixed(1)} m/s)`);
      await g.up('ShiftLeft');
      await g.up('KeyW');
      await t.reach(g, (s) => s.player.speed < 0.2, 'o personagem para ao soltar as teclas');
      const ground = await g.state();
      await g.down('Space');
      await g.waitFrames(2);
      const jumping = await g.state();
      await g.up('Space');
      t.ok(!jumping.player.grounded && jumping.player.y > ground.player.y + 0.15, `Espaço faz o personagem pular (y ${ground.player.y.toFixed(2)} → ${jumping.player.y.toFixed(2)})`);
      const landed = await g.waitState((s) => s.player.grounded, 'o personagem volta ao chão');
      t.near(landed.player.y, ground.player.y, 0.1, 'aterrissa na mesma altura');
    });

    const items = await g.eden('interactables');
    const first = (type) => items.find((item) => item.type === type);

    await t.step('interação: Esfera Aurora', async () => {
      await ensurePlaying(g);
      await approach(g, first('esfera'));
      await g.waitFrames(2);
      t.ok(await g.visible('.hud__prompt'), 'o aviso de interação aparece perto da Esfera');
      t.ok(((await g.text('.hud__prompt')) ?? '').startsWith('E'), 'o aviso mostra a tecla E');
      await g.press('KeyE');
      await t.toast(g, 'Esfera Aurora: modo', 'E muda o modo da Esfera Aurora');
    });

    await t.step('interação: placa informativa e diário', async () => {
      await ensurePlaying(g);
      await approach(g, first('placa'));
      await g.press('KeyE');
      await t.reach(g, (s) => s.modal === 'placa', 'E abre o diálogo da placa');
      t.ok(((await g.text('.screen:last-child .panel__title')) ?? '').length > 2, 'o diálogo da placa tem título');
      await g.press('Escape');
      const s = await t.reach(g, (s) => s.modal === null, 'Esc fecha a placa');
      t.equal(s.entries, 1, 'a placa lida entra no diário');
    });

    await t.step('interação: sentar em um banco', async () => {
      await ensurePlaying(g);
      await approach(g, first('assento'));
      await g.press('KeyE');
      await t.reach(g, (s) => s.player.state === 'sit', 'E faz o personagem sentar no banco');
      await g.down('KeyW');
      await t.reach(g, (s) => s.player.state !== 'sit', 'mover-se faz o personagem levantar');
      await g.up('KeyW');
    });

    await t.step('interação: Fonte dos Desejos', async () => {
      await ensurePlaying(g);
      await approach(g, first('fonte'));
      await g.press('KeyE');
      await t.toast(g, 'pedido', 'a fonte registra um pedido');
    });

    await t.step('Cristal de Luz', async () => {
      await ensurePlaying(g);
      const [crystal] = await g.eden('collectibles');
      await g.eden('teleport', crystal.x, crystal.z, 0);
      await t.reach(g, (s) => s.crystals === 1, 'o cristal é coletado ao encostar');
      await g.waitFrames(1);
      t.equal(await g.text('.pill[title="Cristais de Luz"]'), '1/24', 'o HUD mostra 1/24');
    });

    await t.step('telescópio: vista panorâmica', async () => {
      await ensurePlaying(g);
      await approach(g, first('telescopio'));
      await g.press('KeyE');
      await t.reach(g, (s) => s.mode === 'scenic', 'E no telescópio abre a vista panorâmica');
      await g.waitFrames(3);
      t.ok(!(await g.visible('.hud__corner--tl')), 'o HUD normal some durante a vista');
      t.ok(await g.visible('.hud__bar'), 'a barra da vista mostra como sair');
      await g.press('Escape');
      await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'Esc volta da vista para o jogo');
    });

    await t.step('portais e viagem rápida', async () => {
      await ensurePlaying(g);
      const portals = await g.eden('portals');
      const itemOf = (portal) => items.find((item) => item.id === `portal-${portal.id}`);
      const plaza = [...portals].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      const far = portals.find((portal) => portal.id !== plaza.id && Math.hypot(portal.x - plaza.x, portal.z - plaza.z) > 80);
      const before = (await g.state()).portals;

      // Ativar um segundo portal abre o mapa para escolher o destino.
      await approach(g, itemOf(far));
      await g.press('KeyE');
      await t.reach(g, (s) => s.modal === 'edenphone', `ativar o portal "${far.name}" abre o mapa de viagem`);
      t.equal((await g.state()).portals, before + 1, 'o portal ativado entra na contagem');
      t.equal(await g.text('.phone__app-head h2'), 'Mapa de Aurora City', 'o aplicativo aberto é o Mapa');
      await g.waitFrames(2);
      await g.shot('desktop-mapa');
      await g.clickButton(`${plaza.name}Viajar agora`);
      const atPlaza = await t.reach(g, (s) => s.modal === null && s.gameplay && Math.hypot(s.player.x, s.player.z) < 70, `viagem rápida até "${plaza.name}"`, 60_000);
      t.ok(Math.hypot(atPlaza.player.x - plaza.x, atPlaza.player.z - plaza.z) < 12, 'o jogador chega ao lado do portal de destino');

      // Caminho inverso, abrindo o mapa pelo EdenPhone (Tab).
      await g.press('Tab');
      await t.reach(g, (s) => s.modal === 'edenphone', 'Tab abre o EdenPhone');
      await g.clickButton('Mapa');
      await g.waitFrames(2);
      await g.clickButton(`${far.name}Viajar agora`);
      const back = await t.reach(g, (s) => s.modal === null && s.gameplay && Math.hypot(s.player.x, s.player.z) > 80, `viagem rápida de volta a "${far.name}"`, 60_000);
      t.ok(Math.hypot(back.player.x - far.x, back.player.z - far.z) < 12, 'o jogador chega ao portal distante');
    });

    await t.step('EdenPhone: diário, jornada e céu', async () => {
      await ensurePlaying(g);
      await g.press('Tab');
      await t.reach(g, (s) => s.modal === 'edenphone', 'Tab abre o EdenPhone');
      await g.waitFrames(2);
      await g.shot('desktop-edenphone');
      for (const [app, heading] of [['Diário', 'Diário de Aurora'], ['Jornada', 'Sua jornada'], ['Céu', 'Céu de Aurora']]) {
        await g.clickButton(app);
        await g.waitFrames(1);
        t.equal(await g.text('.phone__app-head h2'), heading, `aplicativo ${app} abre`);
        await g.clickButton('Início');
        await g.waitFrames(1);
      }
      const buttons = await g.buttons();
      t.ok(buttons.some((label) => label.includes('EM BREVE')), 'recursos futuros aparecem marcados como "em breve"');
      await g.press('Escape');
      await t.reach(g, (s) => s.modal === null, 'Esc guarda o EdenPhone');
    });

    await t.step('pausa e configurações', async () => {
      await ensurePlaying(g);
      await g.press('Escape');
      await t.reach(g, (s) => s.modal === 'pausa', 'Esc pausa o jogo');
      t.ok(!(await g.state()).gameplay, 'os controles do jogo ficam inativos na pausa');
      await g.clickButton('Configurações');
      await t.reach(g, (s) => s.modal === 'configuracoes', 'a pausa abre as configurações');
      for (const tab of ['Gráficos', 'Áudio', 'Teclado e toque', 'Controle', 'Jogo']) {
        await g.clickButton(tab);
        await g.waitFrames(1);
        t.equal(await g.text('.tab.is-active'), tab, `aba ${tab} abre`);
      }
      await g.shot('desktop-configuracoes');

      // Volume geral pelo teclado.
      await g.clickButton('Áudio');
      await g.page.focus('[role=tabpanel] input[type=range]');
      for (let i = 0; i < 4; i++) await g.press('ArrowLeft');
      await g.waitFrames(1);
      t.equal(await g.text('[role=tabpanel] output'), '60%', 'setas ajustam o volume geral (80% → 60%)');

      // Remapeia "Pular" para a tecla K.
      await g.clickButton('Teclado e toque');
      await g.page.evaluate(() => {
        const row = [...document.querySelectorAll('[role=tabpanel] .bind-row')].find((r) => r.querySelector('.field__label').textContent === 'Pular');
        row.querySelector('.bind-key').setAttribute('data-e2e', 'pular');
        row.scrollIntoView({ block: 'center' });
      });
      await g.click('[data-e2e=pular]');
      await g.waitFrames(1);
      await g.press('KeyK');
      await g.waitFrames(2);
      const focus = await g.page.evaluate(() => {
        const body = document.querySelector('[role=tabpanel]').getBoundingClientRect();
        const el = document.activeElement;
        const r = el.getBoundingClientRect();
        return { text: el.textContent, visible: r.top >= body.top && r.bottom <= body.bottom };
      });
      t.equal(focus.text, 'K', 'a nova tecla aparece e mantém o foco');
      t.ok(focus.visible, 'a tecla remapeada continua visível (a rolagem é preservada)');
      await g.clickButton('Concluir');
      await t.reach(g, (s) => s.modal === 'pausa', 'Concluir volta para a pausa');
      await g.clickButton('Continuar');
      await t.reach(g, (s) => s.modal === null && s.gameplay, 'Continuar retoma o jogo');

      const ground = await g.state();
      await g.down('KeyK');
      await g.waitFrames(2);
      const jumping = await g.state();
      await g.up('KeyK');
      t.ok(!jumping.player.grounded || jumping.player.y > ground.player.y + 0.15, 'a tecla K agora faz pular');
      await g.waitState((s) => s.player.grounded, 'o personagem volta ao chão');
    });

    await t.step('modo foto', async () => {
      await ensurePlaying(g);
      await g.press('Tab');
      await g.waitState((s) => s.modal === 'edenphone', 'EdenPhone aberto');
      await g.clickButton('Câmera');
      await t.reach(g, (s) => s.mode === 'photo', 'o aplicativo Câmera abre o modo foto');
      await g.waitFrames(2);
      // Guarda a imagem gerada para conferir o que seria baixado.
      await g.page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL);
        window.__photos = [];
        URL.createObjectURL = (blob) => {
          window.__photos.push(blob);
          return original(blob);
        };
      });
      const shown = await g.page.evaluate(() => ({ width: document.getElementById('game-canvas').width, height: document.getElementById('game-canvas').height }));
      await g.clickButton('Fotografar');
      await t.toast(g, 'Foto salva', 'Fotografar salva a foto');
      const photo = await g.page.evaluate(async () => {
        const blob = window.__photos.at(-1);
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(24, 24);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        const colors = new Set();
        for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i] >> 4}-${pixels[i + 1] >> 4}-${pixels[i + 2] >> 4}`);
        return { type: blob.type, width: bitmap.width, height: bitmap.height, colors: colors.size };
      });
      t.equal(photo.type, 'image/png', 'a foto é um arquivo PNG');
      t.ok(photo.width === 960 && photo.height === 540, `a foto sai na resolução da tela (${photo.width}×${photo.height}), não na resolução reduzida do jogo (${shown.width}×${shown.height})`);
      t.ok(photo.colors > 12, `a foto contém a cena, não uma imagem vazia (${photo.colors} tons)`);
      await g.waitFrames(2);
      const after = await g.page.evaluate(() => document.getElementById('game-canvas').width);
      t.ok(after < photo.width, `o jogo volta à resolução reduzida depois da foto (${after} px de largura)`);
      await g.clickButton('Sair');
      await t.reach(g, (s) => s.mode === 'play', 'Sair volta do modo foto para o jogo');
    });

    await t.step('mouse: girar a câmera e zoom', async () => {
      await ensurePlaying(g);
      const before = (await g.state()).camera;
      await g.page.mouse.move(480, 300);
      await g.page.mouse.down();
      await g.page.mouse.move(520, 306, { steps: 4 });
      await g.page.mouse.move(580, 312, { steps: 4 });
      await g.waitFrames(2);
      await g.page.mouse.up();
      const turned = (await g.state()).camera;
      t.ok(Math.abs(turned.yaw - before.yaw) > 0.05, `arrastar o mouse gira a câmera (${before.yaw.toFixed(2)} → ${turned.yaw.toFixed(2)})`);
      await g.page.mouse.wheel({ deltaY: 300 });
      await g.waitFrames(3);
      const zoomed = (await g.state()).camera;
      t.ok(Math.abs(zoomed.distance - turned.distance) > 0.2, `a roda do mouse muda o zoom (${turned.distance.toFixed(2)} → ${zoomed.distance.toFixed(2)})`);
      // Esc libera o cursor (se capturado) e pausa.
      await g.press('Escape');
      await t.reach(g, (s) => s.modal === 'pausa', 'Esc pausa o jogo depois de usar o mouse');
      t.equal(await g.page.evaluate(() => document.pointerLockElement === null), true, 'o cursor fica livre no menu de pausa');
    });

    await t.step('salvamento e erros', async () => {
      await ensurePlaying(g);
      await g.eden('save');
      const data = await g.savedData();
      t.equal(data.profile.name, 'Lia bAero/b', 'o salvamento guarda o nome');
      t.equal(data.progress.crystals.length, 1, 'o salvamento guarda o cristal coletado');
      t.equal(data.progress.photos, 1, 'o salvamento conta a foto tirada');
      t.equal(data.settings.audio.master, 0.6, 'o salvamento guarda o volume ajustado');
      t.ok(data.settings.input.keys.jump.includes('KeyK'), 'o salvamento guarda a tecla remapeada');
      await g.shot('desktop-final');
      t.noErrors(g);
      t.ok(g.warnings.length === 0, `sem avisos no console${g.warnings.length ? `: ${g.warnings.slice(0, 3).join(' | ')}` : ''}`);
    });
  } finally {
    await g.close().catch(() => {});
  }
}
