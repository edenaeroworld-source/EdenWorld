/**
 * Cenário: salvamento local.
 * Confere que o progresso sobrevive a fechar e reabrir o jogo, que
 * "Novo jogo" e "Apagar progresso" fazem exatamente o que prometem e que
 * um salvamento exportado pode ser importado de volta.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensurePlaying, openGame, startNewGame } from '../lib/harness.mjs';

export const title = 'Salvamento: recarregar, continuar, novo jogo, exportar, apagar e importar';

const minutes = (label) => {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
};

export async function run(browser, t) {
  const g = await openGame(browser, { query: 'quality=baixa&noaudio', width: 960, height: 540 });
  let appearance = '';
  let clock = '';
  let exported = '';
  const folder = mkdtempSync(path.join(tmpdir(), 'edenworld-e2e-'));
  try {
    await t.step('progresso e preferências de uma sessão', async () => {
      const s = await startNewGame(g, { name: 'Íris' });
      t.equal(s.name, 'Íris', 'o nome com acento é aceito');
      appearance = JSON.stringify(s.appearance);
      const [crystal] = await g.eden('collectibles');
      await g.eden('teleport', crystal.x, crystal.z, 0);
      await t.reach(g, (s) => s.crystals === 1, 'um Cristal de Luz coletado');

      await g.press('Escape');
      await g.waitState((s) => s.modal === 'pausa', 'pausa');
      await g.clickButton('Configurações');
      await g.clickButton('Áudio');
      await g.page.focus('[role=tabpanel] input[type=range]');
      for (let i = 0; i < 4; i++) await g.press('ArrowLeft');
      await g.clickButton('Jogo');
      await g.clickButton('Câmera automática');
      await g.waitFrames(1);
      t.equal(await g.page.evaluate(() => document.querySelector('[aria-label="Câmera automática"]').getAttribute('aria-checked')), 'false', 'o interruptor "Câmera automática" desliga');
      await g.clickButton('Concluir');
      await g.clickButton('Continuar');
      await g.waitState((s) => s.modal === null, 'jogo retomado');
      await g.eden('teleport', -30, 60, 1.2);
      await g.waitFrames(3);
      clock = (await g.state()).clock;
    });

    await t.step('gravação automática ao fechar a página', async () => {
      // Nenhum comando de salvar: o jogo grava sozinho quando a aba some.
      await g.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const data = await g.savedData();
      t.ok(data !== null, 'o salvamento existe no navegador');
      t.equal(data.version, 1, 'o salvamento é versionado');
      t.near(data.player.x, -30, 0.5, 'posição X gravada');
      t.near(data.player.z, 60, 0.5, 'posição Z gravada');
      t.equal(data.progress.crystals.length, 1, 'cristal gravado');
      t.equal(data.settings.audio.master, 0.6, 'volume gravado');
      t.equal(data.settings.gameplay.autoCamera, false, 'preferência de câmera gravada');
      const text = JSON.stringify(data);
      t.ok(!/senha|password|token|email/i.test(text), 'o salvamento não contém campos sensíveis');
    });

    await t.step('recarregar a página e continuar', async () => {
      await g.reload('quality=baixa&noaudio');
      t.equal((await g.state()).mode, 'menu', 'o jogo reabre no menu');
      const buttons = await g.buttons();
      t.ok(buttons.includes('Continuar') && buttons.includes('Novo jogo'), 'o menu oferece Continuar e Novo jogo');
      t.equal(await g.text('.menu__welcome'), 'Que bom te ver de novo, Íris!', 'o menu cumprimenta o jogador pelo nome');
      t.equal(await g.focused(), 'Continuar', 'o foco inicial está em Continuar');
      await g.sleep(800);
      await g.shot('persistencia-menu-continuar');
      await g.clickButton('Continuar');
      const s = await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'Continuar entra direto no jogo, sem passar pelo criador');
      t.near(s.player.x, -30, 0.6, 'posição X restaurada');
      t.near(s.player.z, 60, 0.6, 'posição Z restaurada');
      t.near(s.player.heading, 1.2, 0.05, 'direção restaurada');
      t.equal(s.crystals, 1, 'cristais restaurados');
      t.equal(s.name, 'Íris', 'nome restaurado');
      t.equal(JSON.stringify(s.appearance), appearance, 'aparência do avatar restaurada');
      t.ok(Math.abs(minutes(s.clock) - minutes(clock)) <= 12, `hora do mundo restaurada (${clock} → ${s.clock})`);

      // O cristal já coletado não reaparece no mundo.
      const [crystal] = await g.eden('collectibles');
      await g.eden('teleport', crystal.x, crystal.z, 0);
      await g.waitFrames(4);
      t.equal((await g.state()).crystals, 1, 'um cristal já coletado não pode ser coletado de novo');

      await g.press('Escape');
      await g.waitState((s) => s.modal === 'pausa', 'pausa');
      await g.clickButton('Configurações');
      await g.clickButton('Áudio');
      await g.waitFrames(1);
      t.equal(await g.text('[role=tabpanel] output'), '60%', 'o volume salvo aparece nas configurações');
      await g.clickButton('Concluir');
    });

    await t.step('sair para o menu e começar um novo jogo', async () => {
      await g.waitState((s) => s.modal === 'pausa', 'pausa');
      await g.clickButton('Salvar e sair para o menu');
      await t.reach(g, (s) => s.mode === 'menu', '"Salvar e sair" volta ao menu principal');
      await g.clickButton('Novo jogo');
      await t.reach(g, (s) => s.modal === 'novo-jogo', 'Novo jogo pede confirmação antes de apagar');
      await g.clickButton('Cancelar');
      await t.reach(g, (s) => s.modal === 'menu', 'Cancelar mantém tudo como estava');
      t.equal((await g.savedData()).progress.crystals.length, 1, 'cancelar não apaga o progresso');

      await g.clickButton('Novo jogo');
      await g.waitState((s) => s.modal === 'novo-jogo', 'confirmação');
      await g.clickButton('Apagar e começar');
      await t.reach(g, (s) => s.mode === 'creator', 'a confirmação leva ao criador de avatar');
      t.equal(await g.page.evaluate(() => document.querySelector('.text-input').value), '', 'o campo de nome começa vazio');
      await g.press('Escape');
      await g.waitFrames(2);
      t.equal((await g.state()).mode, 'creator', 'Esc não pula a criação do primeiro avatar');
      await g.clickButton('Entrar em Aurora City');
      const s = await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'o novo jogo começa');
      t.equal(s.crystals, 0, 'o novo jogo começa sem cristais');
      t.equal(s.entries, 0, 'o novo jogo começa com o diário vazio');
      t.equal(s.name, 'Viajante', 'sem nome informado, o jogador é "Viajante"');
      t.near(s.player.z, 30, 1.5, 'o novo jogo começa no ponto inicial');
      await g.eden('save');
      t.equal((await g.savedData()).settings.audio.master, 0.6, 'as configurações são mantidas no novo jogo');
    });

    await t.step('exportar e apagar o progresso', async () => {
      await ensurePlaying(g);
      // Um pouco de progresso, para o arquivo exportado ter o que guardar.
      const [first, second] = await g.eden('collectibles');
      await g.eden('teleport', first.x, first.z, 0);
      await g.waitState((s) => s.crystals === 1, 'primeiro cristal');
      await g.eden('teleport', second.x, second.z, 0);
      await g.waitState((s) => s.crystals === 2, 'segundo cristal');
      await g.eden('teleport', -30, 60, 1.2);
      await g.waitFrames(3);
      await g.press('Escape');
      await g.waitState((s) => s.modal === 'pausa', 'pausa');
      await g.clickButton('Configurações');
      await g.clickButton('Jogo');
      // Guarda o conteúdo do arquivo que o navegador baixaria.
      await g.page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL);
        window.__downloads = [];
        URL.createObjectURL = (blob) => {
          window.__downloads.push(blob);
          return original(blob);
        };
      });
      await g.clickButton('Exportar salvamento');
      await t.toast(g, 'Salvamento exportado.', 'exportar gera o arquivo de salvamento');
      exported = await g.page.evaluate(() => window.__downloads.at(-1)?.text() ?? '');
      const file = JSON.parse(exported || 'null');
      t.ok(file?.version === 1 && file.profile.name === 'Viajante', 'o arquivo exportado é um salvamento legível');
      t.equal(file?.progress.crystals.length, 2, 'o arquivo exportado guarda o progresso');
      await g.clickButton('Apagar progresso');
      await t.reach(g, (s) => s.modal === 'apagar', 'Apagar progresso pede confirmação');
      await g.waitFrames(1);
      await g.shot('persistencia-apagar');
      await g.page.evaluate(() => document.querySelector('.screen:last-child .btn--danger').click());
      await t.toast(g, 'Progresso apagado.', 'o aviso "Progresso apagado" aparece');
      await t.reach(g, (s) => s.mode === 'menu', 'depois de apagar, o jogo volta ao menu');
      const buttons = await g.buttons();
      t.ok(buttons.includes('Jogar') && !buttons.includes('Continuar'), 'o menu volta a oferecer apenas Jogar');
      t.equal((await g.savedData())?.profile?.created ?? false, false, 'não resta avatar salvo');
    });

    await t.step('importar o salvamento exportado', async () => {
      const other = path.join(folder, 'receita.json');
      const good = path.join(folder, 'edenworld-save.json');
      writeFileSync(other, JSON.stringify({ receita: 'bolo de cenoura', ingredientes: ['cenoura', 'farinha'] }));
      // O arquivo traz configurações diferentes das deste navegador: elas não devem ser aplicadas.
      const data = JSON.parse(exported);
      data.settings.audio.master = 0.25;
      data.settings.graphics = { ...(data.settings.graphics ?? {}), quality: 'alta' };
      writeFileSync(good, JSON.stringify(data));
      const choose = async (file) => {
        const [chooser] = await Promise.all([g.page.waitForFileChooser({ timeout: 30_000 }), g.clickButton('Importar salvamento')]);
        await chooser.accept([file]);
      };

      await g.clickButton('Configurações');
      await g.clickButton('Jogo');
      await choose(other);
      await t.toast(g, 'não é um salvamento', 'um arquivo que não é do jogo é recusado com um aviso');
      t.equal((await g.state()).modal, 'configuracoes', 'o arquivo recusado não muda nada');

      await choose(good);
      await t.reach(g, (s) => s.modal === 'importar', 'um salvamento válido pede confirmação antes de substituir o progresso');
      const summary = (await g.text('.screen:last-child .panel__body')) ?? '';
      t.ok(summary.includes('Viajante') && summary.includes('2 de 24'), `a confirmação mostra o conteúdo do arquivo ("${summary.slice(0, 60)}…")`);
      await g.waitFrames(1);
      await g.shot('persistencia-importar');
      await g.clickButton('Cancelar');
      await g.waitState((s) => s.modal === 'configuracoes', 'de volta às configurações');
      t.equal((await g.savedData())?.profile?.created ?? false, false, 'cancelar não importa nada');

      await choose(good);
      await g.waitState((s) => s.modal === 'importar', 'confirmação de importação');
      await Promise.all([g.page.waitForNavigation({ waitUntil: 'load', timeout: 120_000 }), g.clickButton('Importar')]);
      await g.ready();
      t.equal((await g.state()).mode, 'menu', 'o jogo recarrega e volta ao menu');
      t.ok((await g.buttons()).includes('Continuar'), 'o menu oferece Continuar com o salvamento importado');
      const saved = await g.savedData();
      t.equal(saved.progress.crystals.length, 2, 'o progresso do arquivo está gravado no navegador');
      t.equal(saved.settings.audio.master, 0.6, 'o volume deste navegador é mantido, não o do arquivo');
      t.ok(saved.settings.graphics?.quality !== 'alta', 'a qualidade gráfica do arquivo não é imposta a este aparelho');
      await g.clickButton('Continuar');
      const s = await t.reach(g, (s) => s.mode === 'play' && s.modal === null, 'Continuar entra no jogo importado');
      t.equal(s.crystals, 2, 'os cristais importados aparecem no jogo');
      t.near(s.player.x, -30, 0.5, 'a posição X do arquivo é restaurada');
      t.near(s.player.z, 60, 0.5, 'a posição Z do arquivo é restaurada');
    });

    await t.step('erros', async () => {
      t.noErrors(g);
    });
  } finally {
    await g.close().catch(() => {});
    rmSync(folder, { recursive: true, force: true });
  }
}
