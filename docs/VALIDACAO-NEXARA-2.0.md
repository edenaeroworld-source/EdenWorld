# Validação — Nexara 2.0

Deusa da Internet e das Redes. Reconstruída do zero sobre `7ce4e2b`.
Este documento registra o que foi medido, com que ferramenta, e o que
a bancada reprovou pelo caminho.

---

## 1. O que entrou

| peça | onde | como |
|---|---|---|
| acabamento `Holo` | `BodyRig.ts`, `BodyFinish.ts` | oitavo acabamento, oitava tabela |
| `FINISH_EMISSIVE` | `BodyFinish.ts` | `[0,0,0,0,0,0,0,0.55]` |
| emissão no shader | `Avatar.ts` | `emissivemap_fragment`, sem passe novo |
| cor de auréola por ficha | `Pantheon.ts`, `CharacterModels.ts` | `halo?: number`, padrão dourado |
| cabelo `fluxo` | `BodyBuilder.ts` | queda longa, degradê de matiz, relevo de mechas |
| anéis orbitais | `BodyBuilder.ts` | dois toros no osso da cabeça, dentro da malha |
| traje `rede` | `BodyBuilder.ts` | gola alta, ombreiras de vidro, gema, véu curto |
| ficha | `Pantheon.ts` | `fluxo` + `rede` + olhos ciano |
| bancada | `lab.html` | opção `nexara` na cena de deusa |

---

## 2. Isolamento — a prova dura

O requisito mais rígido do marco é que **só a Nexara mude**. Afirmar
isso por leitura de diff é fraco, porque a geometria do Éden nasce de
funções compartilhadas: basta uma constante trocada no lugar errado
para outra personagem mudar sem que o diff pareça suspeito.

A prova foi feita por **hash da malha construída**: posição, normal,
cor, acabamento e índice de cada avatar, nos quatro níveis de
detalhe, comparando a árvore da `main` (`7ce4e2b`, montada em
`git worktree`) com a desta branch.

| personagem | baixa | media | alta | ultra |
|---|---|---|---|---|
| PADRÃO | igual | igual | igual | igual |
| LUMA | igual | igual | igual | igual |
| SUKI | igual | igual | igual | igual |
| AÉRION | igual | igual | igual | igual |
| AMARA | igual | igual | igual | igual |
| **NEXARA** | **mudou** | **mudou** | **mudou** | **mudou** |

Hashes idênticos, dígito por dígito, em vinte das vinte e quatro
combinações. As quatro que mudaram são exatamente as dela.

Este teste **pegou um erro real**: o alongamento do cabelo de uma das
rodadas tinha sido aplicado no `case 'ondulado'`, que é o cabelo da
**Luma**, e não no `case 'fluxo'`. Nenhuma captura da Nexara mostraria
isso. Foi revertido e reaplicado no lugar certo.

---

## 3. Orçamento

Medido com `vite-node` sobre a geometria real, nunca estimado.

| nível | padrão | **Nexara 2.0** | Suki 2.0 | Luma 2.0 |
|---|---|---|---|---|
| baixa | 6 118 t | **6 420 t** | 6 592 t | 7 028 t |
| media | 10 694 t | 11 632 t | 12 320 t | 12 404 t |
| alta | 17 818 t | 19 422 t | 20 758 t | 20 706 t |
| ultra | 62 224 t | 69 336 t | 74 032 t | 73 640 t |

**Teto do LOD baixo: 7 145 t. Nexara: 6 420 t. Folga: 725 t.**
É a mais leve das três deusas remasterizadas.

**Chamadas de desenho: paridade exata com o avatar padrão**, nos quatro
níveis. Anéis, véu, ombreiras e gema estão todos na malha única do
corpo. Verificado por teste automatizado, contando malhas.

---

## 4. Capturas

Todas em `docs/validacao/nexara/`, renderizadas em **WebGL 2.0**
(ANGLE / Vulkan 1.3 / SwiftShader), nível `ultra`, console **sem um
único erro** em todas elas.

| arquivo | enquadramento |
|---|---|
| `antes-corpo.png` | a Nexara anterior: cabelo `longo` roxo, traje `aero` |
| `antes-costas.png` | idem, de costas |
| `antes-rosto.png` | idem, rosto |
| `depois-corpo.png` | frente, corpo inteiro |
| `depois-costas.png` | costas, o juiz do cabelo |
| `depois-perfil.png` | perfil, o outro juiz |
| `depois-rosto.png` | rosto, olhos ciano e halo duplo |
| `depois-andando.png` | ciclo de caminhada, anéis em movimento |
| `depois-noite.png` | 22 h, para ver a emissão trabalhar |

O comparativo antes/depois foi feito **no mesmo enquadramento e na
mesma cena**, trocando apenas a aparência, para que a diferença seja da
personagem e não da câmera.

---

## 5. Os defeitos que a bancada pegou

Nenhum destes apareceu em código; todos apareceram em imagem ou em
medida. Ficam registrados porque a lição é reaproveitável.

**1. Véu-lençol.** A primeira versão do véu descia pelas costas e
**apagava o cabelo**: malha opaca de material único, véu por cima,
cabelo some. Medido antes de insistir: de `y 0,25` a `0,85` as costas
são cabelo e os flancos são braço a partir de `x ≈ 0,10`. Véu longo é
impossível neste corpo. Virou véu curto de quadril.

**2. Ombreira bufante.** Altura de meio raio transforma placa em manga.
Baixada para `y ≈ 0,03`.

**3. Três triângulos de pele na altura da orelha.** A orelha é uma
varredura à parte e chega a **1,025·R** — medido, não estimado —,
enquanto a queda passava a `0,976·R`. Não era orelha à mostra: era a
malha da orelha atravessando a do cabelo.

**4. Faixa de pele na nuca.** Este custou três diagnósticos errados.
Dedução por coordenada apontou "vão entre anéis" **três vezes**, e as
três estavam erradas. O **traçado de raios** achou em minutos: a falha
estava num azimute só, e falha assimétrica tem causa assimétrica — a
onda em S começava alto demais e escorregava o cabelo para o lado na
altura da orelha. Travada enquanto o cabelo cobre o crânio.
Resultado: **0 de 4 131 raios** da metade de trás batem em pele.

**5. Costas lisas como capuz, duas vezes.** A primeira versão dos
sulcos tinha raio lateral de `0,11·R`, menor que o espaçamento entre
vértices do anel (`0,034`): relevo mais estreito que a distância entre
dois vértices não afunda uma superfície, afunda **um vértice**, e o
sombreamento suave apaga o resto. A segunda versão tinha largura
suficiente — 27% de afundamento, medido — e ainda assim lia como capuz,
porque os sulcos estavam **em alturas diferentes**: nenhuma altura
tinha mais de um. Seis covinhas espalhadas não são mechas. Viraram três
canais verticais contínuos. Medida final: **19 de 19 alturas da queda
com relevo**, e o perfil por azimute alterna vale e crista.

**6. Tábua de perfil.** Profundidade caindo em linha reta do alto até a
ponta desenha uma cunha encostada nas costas. Virou curva de raiz, com
afunilamento só perto da ponta.

**7. Anéis dentro do crânio.** Estavam em `cy + 0,2`; o alto da cabeça
está em `cy + 0,229`. Atravessavam a calota e liam como bolo de
camadas. Subiram e encolheram — aro bem maior que a cabeça lê como
chapéu, não como halo.

**8. Fresta entre a calota e a queda.** Com o topo da queda quase na
mesma altura em que a calota começa, dois raios desciam pela fresta e
batiam no crânio em `y = 0,743`. O topo foi enterrado dentro da calota
e apertado — o aperto também evita o degrau de anel aparecendo como
friso.

**9. Torcicolo.** A onda em S com amplitude `0,42·R` não lia como
fluxo: lia como massa torta, com o degradê escorrendo todo para um
lado. Caiu para `0,2·R`.

---

## 6. Testes

`tests/unit/nexara-remaster.test.ts` — **24 casos, todos passando.**

Dois merecem nota:

**A coluna zerada.** O caso que verifica `FINISH_EMISSIVE` com zero nos
sete acabamentos antigos é a prova de não-regressão visual do marco
inteiro: enquanto ele passar, a conta que o shader faz para todo mundo
que não é Nexara continua somando zero.

**A nuca por traçado de raios.** A primeira versão deste teste
amostrava, em cada faixa de altura, o vértice mais recuado, e exigia
que fosse cabelo. Ela **acusava defeito onde não havia**: basta a malha
do cabelo, mais esparsa, não ter vértice naquela faixa para o vértice
mais recuado ser o do crânio, com o cabelo passando por fora. Raio que
sai de fora e para no primeiro triângulo responde a pergunta certa: *o
que se vê daqui é pele?*

---

## 7. Portão

| etapa | resultado |
|---|---|
| `npx tsc --noEmit` | **limpo** |
| `npx vitest run` | **1 131 passando**, 11 pulados, 1 falhando |
| `npm run build` | **limpo**, 153 módulos, 449 ms |
| render WebGL2 | sem erros de console em nove capturas |
| LOD | quatro níveis montam; transição não perde nem duplica peça |

### A falha, documentada à parte

`tests/unit/coracao-roseiral.test.ts` → *"nenhum habitante nasce
dentro, nem vai parar lá em dois minutos de parque"* — **Test timed out
in 5000ms**.

Não tem relação com a Nexara, e isto foi **provado, não suposto**:

| execução | resultado |
|---|---|
| base limpa `7ce4e2b`, arquivo isolado | passa em **4 792 ms** |
| base limpa `7ce4e2b`, suíte inteira, 1ª vez | **passa** |
| base limpa `7ce4e2b`, suíte inteira, 2ª vez | **falha — 5 335 ms** |
| branch Nexara, arquivo isolado | passa em **4 844 ms** |
| branch Nexara, suíte inteira | falha |

O teste consome **96% do próprio teto de tempo** na base, sem nenhuma
linha da Nexara envolvida. Sob a contenção de sessenta workers ele vira
cara-ou-coroa. É um teto apertado demais para o que o teste faz —
simular dois minutos de parque —, e a correção certa é dar-lhe um
tempo compatível.

**Não foi alterado neste PR**, por duas razões: é fora do escopo de um
PR exclusivo da Nexara, e mexer no tempo de um teste alheio no meio de
outro marco é exatamente o tipo de alteração que mascara o que deveria
ficar visível. Fica registrado para decisão do Criador.

Ainda assim, o arquivo de teste da Nexara foi deixado **mais barato do
que precisava ser** — nível `alta` em vez de `ultra`, grade de raios
grossa — para somar o mínimo de carga à suíte dos outros.

---

## 8. O que não entra

- Nenhuma alteração em Luma, Suki-Chan, Amara ou Aérion — provado por
  hash de malha.
- Nenhuma alteração visual em materiais antigos — provada pela coluna
  zerada.
- Nenhuma chamada de desenho a mais.
- Nenhuma remasterização adicional.
