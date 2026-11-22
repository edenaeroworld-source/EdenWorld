// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME, VERSION_FULL } from '../../src/core/Config';
import { MainMenuScreen } from '../../src/interface/Screens';

/**
 * A versão do EDENWORLD, e a promessa de que ela está escrita em um lugar só.
 *
 * **Por que este arquivo existe.** Até a Genesis 0.5 o número morava em seis
 * lugares, cada um editado à mão, e eles divergiram em silêncio: o README
 * anunciava a Genesis 0.2 enquanto `src/core/Config.ts`, o `package.json`, o
 * `index.html` e o manifesto ainda diziam "Genesis 0.1" — e era a 0.1 que o
 * jogador via no rodapé do menu e na tela Sobre. Ninguém percebeu por 33 pull
 * requests, porque nada quebrava quando um deles ficava para trás.
 *
 * Agora `GAME` é a fonte: o `index.html` recebe o valor por injeção no
 * `vite.config.ts` e a interface lê direto. O que não dá para derivar é o
 * `package.json`, que precisa do número literal — então o espelho dele é
 * guardado aqui. **Este teste é o que impede a deriva de voltar.**
 */

const raiz = resolve(__dirname, '../..');
const ler = (caminho: string): string => readFileSync(resolve(raiz, caminho), 'utf-8');

describe('a versão do EDENWORLD mora num lugar só', () => {
  it('o package.json espelha exatamente GAME.version', () => {
    const pkg = JSON.parse(ler('package.json')) as { version: string };
    expect(pkg.version).toBe(GAME.version);
  });

  it('a descrição do package.json traz a linha da versão em dia', () => {
    const pkg = JSON.parse(ler('package.json')) as { description: string };
    expect(pkg.description).toContain(GAME.versionLabel);
    expect(pkg.description).toContain(GAME.versionName);
  });

  it('o número é SemVer e combina com o rótulo', () => {
    expect(GAME.version).toMatch(/^\d+\.\d+\.\d+$/);
    // "Genesis 0.5" e "0.5.0" têm de falar do mesmo marco: se alguém subir um
    // sem o outro, o jogador vê dois números diferentes na mesma tela Sobre,
    // que mostra `Genesis 0.5 (v0.5.0)`.
    const [maior, menor] = GAME.version.split('.');
    expect(GAME.versionLabel).toContain(`${maior}.${menor}`);
  });

  it('o index.html não repete o número: ele recebe por injeção', () => {
    const html = ler('index.html');
    expect(html).toContain('%EDEN_VERSION_LABEL%');
    // A armadilha original: um número literal aqui envelhece sem avisar,
    // porque nada no build confere o conteúdo de uma meta tag.
    expect(html).not.toMatch(/Genesis \d+\.\d+/);
  });

  it('o manifesto não carrega versão nenhuma', () => {
    // Nome de aplicativo instalado não muda a cada lançamento — e cada lugar
    // a menos é um lugar que não pode divergir.
    const manifesto = ler('public/manifest.webmanifest');
    expect(manifesto).not.toMatch(/\d+\.\d+/);
    expect(JSON.parse(manifesto).name).toBe(GAME.name);
  });

  it('nenhum arquivo de código prende uma versão em prosa', () => {
    // Comentários do tipo "a Genesis 0.1 é off-line" descrevem o presente e
    // envelhecem junto com ele. Cinco existiam, e todos foram reescritos sem
    // número. O `Config.ts` é a exceção legítima: ele é a fonte.
    const arquivos = [
      'src/eden-connect/EdenConnect.ts',
      'src/physics/Collision.ts',
      'src/shared/FutureFeatures.ts',
      'src/social/SocialSystem.ts',
      'src/world/Weather.ts',
      'src/core/Engine.ts',
      'src/interface/Screens.ts',
    ];
    for (const arquivo of arquivos) {
      expect(ler(arquivo), `${arquivo} não pode fixar um número de versão`).not.toMatch(/Genesis \d+\.\d+/);
    }
  });

  it('o rodapé do menu principal mostra a versão desta build', () => {
    // Procurar `GAME.versionLabel` no código-fonte provaria pouco: provaria
    // que a string aparece, não que o jogador a vê. Então o menu é montado
    // de verdade, num DOM, e se lê o que está escrito nele — que é
    // exatamente o lugar onde a Genesis 0.1 ficou visível por 33 PRs.
    const menu = new MainMenuScreen({
      onContinue: () => {},
      onNewGame: () => {},
      onSettings: () => {},
      onAbout: () => {},
    });
    menu.configure(null);
    const rodape = menu.element.querySelector('.menu__foot');
    expect(rodape).not.toBeNull();
    expect(rodape?.textContent).toContain(GAME.versionLabel);
    expect(rodape?.textContent).toContain(GAME.name);
    // E não pode sobrar nenhum outro número de versão na tela.
    expect(menu.element.textContent ?? '').not.toMatch(/Genesis (?!0\.5)\d+\.\d+/);
  });

  it('a tela Sobre descreve o jogo que existe, não o de duas versões atrás', () => {
    const engine = ler('src/core/Engine.ts');
    // O texto antigo dizia "é a primeira versão jogável" e listava o
    // EdenReads entre os recursos que "ainda não existem" — ele existe desde
    // a Genesis 0.2. Prometer a menos também é estar errado.
    expect(engine).not.toContain('é a primeira versão jogável');
    expect(engine).toContain('GAME.versionLabel');
    expect(engine).toContain('GAME.versionName');
  });

  it('a linha completa se monta sozinha', () => {
    expect(VERSION_FULL).toBe(`${GAME.name} — ${GAME.versionLabel} · “${GAME.versionName}”`);
  });

  it('esta versão é a Genesis 0.5 — O universo ganha corpo', () => {
    // Trava do marco: muda de propósito, no commit que subir a versão.
    expect(GAME.version).toBe('0.5.0');
    expect(GAME.versionLabel).toBe('Genesis 0.5');
    expect(GAME.versionName).toBe('O universo ganha corpo');
  });
});
