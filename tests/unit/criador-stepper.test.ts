// @vitest-environment happy-dom
//
// A trilha de etapas do criador rola na horizontal e tem a barra de
// rolagem escondida de propósito. Como `render()` reconstrói a trilha
// a cada etapa, o `scrollLeft` nascia sempre em zero: da quarta etapa
// em diante a aba acesa ficava fora da área visível e o painel exibia
// a trilha **sem nenhuma aba marcada**. Medido no Chromium 153, em
// 1280×900: caixa visível de 859 a 1243 px, aba "6. Pronto" em
// 1354..1443, `scrollLeft` igual a 0 nas seis etapas.
//
// `happy-dom` não calcula layout — todo retângulo vem zerado —, então
// o que dá para testar aqui é a **conta** que decide onde a faixa
// para, e o estado da trilha. O posicionamento em si foi conferido no
// navegador de verdade, nos dois tamanhos de tela.
import { describe, expect, it } from 'vitest';
import { AvatarCreatorScreen, alvoDaTrilha } from '../../src/interface/AvatarCreator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';

/** Medidas reais colhidas no Chromium, em 1280×900. */
const CAIXA = 384;
const CONTEUDO = 584;

function montar() {
  const tela = new AvatarCreatorScreen({
    onPreview: () => {},
    onConfirm: () => {},
    onCancel: () => {},
    onRotate: () => {},
  });
  tela.configure('Viajante', { ...DEFAULT_APPEARANCE, sex: 'fem' }, false);
  // A trilha só existe depois da escolha Ele/Ela: antes disso a tela
  // é a dos dois cartões, e não há etapa nenhuma para marcar.
  const card = tela.element.querySelector<HTMLButtonElement>('.sex-card[data-sex="fem"]');
  if (!card) throw new Error('cartão de silhueta não encontrado');
  card.click();
  return tela;
}

const abas = (tela: AvatarCreatorScreen) =>
  Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.stepper__item'));

describe('A trilha de etapas para no lugar certo', () => {
  it('não rola quando tudo já cabe na caixa', () => {
    // Faixa larga o bastante: rolar seria esconder abas à toa.
    expect(alvoDaTrilha(600, 584, 400, 93)).toBe(0);
    expect(alvoDaTrilha(584, 584, 400, 93)).toBe(0);
  });

  it('centraliza a aba ativa quando há folga dos dois lados', () => {
    // Aba de 93 px começando em 300: centro da caixa de 384 pede
    // 300 − (384 − 93) / 2 = 154,5.
    expect(alvoDaTrilha(CAIXA, CONTEUDO, 300, 93)).toBeCloseTo(154.5, 3);
  });

  it('não rola para trás da primeira aba', () => {
    // A primeira aba centralizada pediria um valor negativo.
    expect(alvoDaTrilha(CAIXA, CONTEUDO, 0, 82)).toBe(0);
    expect(alvoDaTrilha(CAIXA, CONTEUDO, 20, 82)).toBe(0);
  });

  it('não rola além do fim do conteúdo', () => {
    // A última aba ("6. Pronto", início 495) centralizada pediria
    // mais do que existe: trava em 584 − 384 = 200, que é exatamente
    // o valor que o navegador mostrou na etapa 6.
    expect(alvoDaTrilha(CAIXA, CONTEUDO, 495, 89)).toBe(200);
  });

  it('o valor devolvido deixa a aba inteira dentro da caixa', () => {
    // Varredura: para cada aba possível, a janela [alvo, alvo+caixa]
    // tem de conter [inicio, inicio+largura] sempre que couber.
    for (let inicio = 0; inicio + 93 <= CONTEUDO; inicio += 7) {
      const alvo = alvoDaTrilha(CAIXA, CONTEUDO, inicio, 93);
      expect(alvo).toBeGreaterThanOrEqual(0);
      expect(alvo).toBeLessThanOrEqual(CONTEUDO - CAIXA);
      expect(inicio).toBeGreaterThanOrEqual(alvo - 0.001);
      expect(inicio + 93).toBeLessThanOrEqual(alvo + CAIXA + 0.001);
    }
  });
});

describe('A trilha continua inteira e clicável', () => {
  it('as seis etapas aparecem, e só uma fica marcada', () => {
    const tela = montar();
    const its = abas(tela);
    expect(its).toHaveLength(6);
    expect(its.map((b) => b.textContent)).toEqual([
      '1. Rosto',
      '2. Cabelo',
      '3. Roupa',
      '4. Acessórios',
      '5. Ajustes',
      '6. Pronto',
    ]);
    expect(its.filter((b) => b.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('clicar numa aba distante troca a etapa e marca só ela', () => {
    const tela = montar();
    abas(tela)
      .find((b) => (b.textContent ?? '').includes('Pronto'))!
      .click();
    const its = abas(tela);
    const acesas = its.filter((b) => b.getAttribute('aria-selected') === 'true');
    expect(acesas).toHaveLength(1);
    expect(acesas[0].textContent).toBe('6. Pronto');
  });

  it('ir e voltar pelas seis etapas sempre deixa a atual marcada', () => {
    const tela = montar();
    const nomes = ['1. Rosto', '2. Cabelo', '3. Roupa', '4. Acessórios', '5. Ajustes', '6. Pronto'];
    for (const nome of [...nomes, ...[...nomes].reverse()]) {
      abas(tela)
        .find((b) => b.textContent === nome)!
        .click();
      const acesas = abas(tela).filter((b) => b.getAttribute('aria-selected') === 'true');
      expect(acesas).toHaveLength(1);
      expect(acesas[0].textContent).toBe(nome);
    }
  });

  it('sem layout a trilha não tenta rolar, e nada quebra', () => {
    // `happy-dom` devolve retângulos zerados. O ajuste tem de sair de
    // mansinho em vez de escrever um NaN no `scrollLeft`.
    const tela = montar();
    const trilha = tela.element.querySelector<HTMLElement>('.stepper')!;
    expect(trilha.scrollLeft).toBe(0);
    expect(Number.isNaN(trilha.scrollLeft)).toBe(false);
  });
});
