# Amara 2.0 — plano técnico

**Marco:** remasterização visual exclusiva de Amara, Deusa da Maternidade.
**Branch:** `arena/7d4cc6fa-edenworld`, a partir de `f38a2ec` (`main`).
**Escopo:** só Amara. Aérion, as outras nove deusas e os habitantes ficam
bit a bit idênticos.

Este documento é escrito **antes** da geometria, como nos marcos da
Saturno, da Maze e da Júpiter: a investigação primeiro, as decisões do
Criador registradas, e só então o código.

---

## 1. O que a investigação encontrou

### 1.1 Ela é a última deusa com as duas peças genéricas

Com a Júpiter mergeada, nove das onze personagens do Panteão já têm
penteado e traje próprios. Restam duas: **Aérion**, o Criador, que é um
caso à parte, e **Amara**.

A ficha dela hoje (`src/characters/Pantheon.ts:1202`):

```ts
look('#7d4a2c', 'longo', '#2b1d16', '#c98a2b', 'aero', '#f3ead6', '#c79a3a', '#ffffff', 'nenhum', 1.02)
```

`longo`, `aero` e `nenhum` — as três genéricas, as três compartilhadas.

### 1.2 Ela é geometricamente idêntica ao Aérion

Medido com `tools/assinaturas.ts` no baseline `f38a2ec`: as assinaturas
de corpo de `panteao/amara` e `panteao/aerion` **coincidem nos quatro
LODs**. A única diferença entre a Deusa da Maternidade e o Criador do
Éden Aero, hoje, é a semente do rosto (`82077817` contra `787622777`) e
a cor do olho.

Duas personagens com papéis opostos no cânone saem da mesma malha.

### 1.3 Ela é a mais barata do elenco, e por falta de peça

Triângulos somando as três malhas (corpo + rosto + halo), por LOD:

| personagem | baixa | média | alta | ultra |
| --- | --- | --- | --- | --- |
| **amara** | **8 220** | **12 948** | **20 330** | **66 224** |
| aerion | 8 220 | 12 948 | 20 330 | 66 224 |
| haru | 7 892 | 14 146 | 21 838 | 68 520 |
| saturno | 8 176 | 14 044 | 21 846 | 70 612 |
| jupiter | 8 140 | 13 838 | 22 394 | 76 446 |
| luma | 8 960 | 14 336 | 22 638 | 75 572 |
| maze | 7 944 | 15 808 | 32 530 | 81 620 |

Custo marginal das peças dela, medido trocando uma de cada vez:

| peça | baixa | média | alta | ultra |
| --- | --- | --- | --- | --- |
| cabelo `longo` | 380 | 728 | 1 320 | 4 752 |
| traje `aero` | 360 | 384 | 456 | 744 |

O traje inteiro dela custa **744 triângulos em ultra** — um anel no
pescoço e uma bolinha no peito. Há cerca de **15 000 triângulos de
folga em ultra** até o teto do elenco (`maze`, 81 620).

### 1.4 O que ela veste hoje não tem nada de deusa

Capturas do estado original, na bancada (`/tmp/cap/a0-*.png`):

- **frente** — blusa creme de manga comprida e calça dourada;
- **perfil** — cabelo que para no ombro, reto;
- **costas** — o `longo` lê como uma capa chata e escura;
- **rosto** — sem acessório nenhum.

A leitura é de habitante da cidade, não de divindade.

### 1.5 A bancada escondia o traço principal dela

A cena `deusa` de `src/lab/main.ts` aplicava a aparência e os Afters da
ficha, mas **não** a gestação — que `CharacterModels.ts` aplica no jogo.
A primeira captura deste marco saiu com a Amara **sem ventre**: uma
montagem que não existe em lugar nenhum do Éden.

Corrigido antes de qualquer decisão de traje (`avatar.setGestation(ficha.gestation ?? 0)`).
Sem isso, nenhuma peça sobre o tronco poderia ser avaliada.

### 1.6 Medidas da malha (ultra, altura 1,02)

| medida | valor |
| --- | --- |
| cintura / junta do tronco | `y = 0,060` |
| linha dos ombros | `y = 0,430` |
| base do pescoço | `y = 0,4805`, raio `0,0501` |
| centro da cabeça | raio `R = 0,1710` |
| topo do crânio | `y = 0,9265` |
| orelha | `\|x\| = 0,1804` em `y = 0,6820` |
| frente do rosto | `z = 0,2089` em `y = 0,6653` |
| raio do peito / cintura / quadril | `0,1661` / `0,1411` / `0,1701` |
| ombro `x` / punho | `0,1768` / `0,0404` |
| barra longa (`GOWN_HEM_Y`) | `y = −0,46` |

### 1.7 A restrição que manda neste marco: o ventre deforma tudo

`src/player/Gestation.ts` desloca os vértices das zonas `Bust` e
`Curve` por uma banda gaussiana, **multiplicando** o raio. Medido na
malha real, já descontando `aMorphOrigin` como o shader faz:

| `y` | frente sem ventre | com ventre | ganho |
| --- | --- | --- | --- |
| 0,36 | 0,0999 | 0,1004 | +0,0004 |
| 0,32 | 0,1110 | 0,1178 | +0,0068 |
| 0,24 | 0,1100 | 0,1711 | +0,0611 |
| **0,16** | **0,0932** | **0,1881** | **+0,0949** |
| 0,08 | 0,0915 | 0,1406 | +0,0491 |
| 0,04 | 0,1101 | 0,1209 | +0,0107 |
| −0,04 | 0,1028 | 0,1043 | +0,0015 |
| −0,08 | 0,0956 | 0,0959 | +0,0002 |

O pico está em **`y = 0,16`**, onde a frente do corpo **dobra**
(fator 2,02×). A deformação é relevante em **`y ∈ [0,04 ; 0,32]`**.

> **Regra de ouro deste marco.** Geometria rígida — fivela, pedra,
> gargantilha, aro — só **acima de `y = 0,36`** ou **abaixo de
> `y = −0,04`**. Dentro da banda, só pano, e pano que acompanhe: como o
> deslocamento é multiplicativo, uma camada mais à frente afasta-se
> mais que a pele, e a folga entre as duas **aumenta** em vez de
> encolher — é seguro vestir o ventre, desde que a peça declare
> `zone: MorphZone.Bust` (ou `Curve`) e a `origin` da junta certa.
> Peça sem zona declarada fica parada enquanto o corpo cresce, e o
> ventre atravessa a roupa.

---

## 2. As decisões que o Criador tomou

Quatro perguntas, respondidas antes da implementação:

| questão | decisão |
| --- | --- |
| paleta | **o verde-água da arte** — repinta `colors` e `aura` da ficha |
| cabelo | **clarear**, como na referência |
| maternidade no traje | **um manto que envolve e protege** |
| acessório | **halo materno** |

A arte de referência enviada pelo Criador mostra: ombros nus, gola alta
cravejada descendo em colar sobre o peito, vestido longo de vidro
verde-água, cabelo clarís­simo até abaixo da cintura, e fios de luz por
toda a cena. O ventre é o centro da composição, acolhido pelas mãos.

---

## 3. Fronteiras com quem já tem marco

Sair do dourado resolve uma vizinhança e cria outra. As duas estão
medidas em matiz HSL:

| deusa | tom claro | matiz | tom escuro | matiz |
| --- | --- | --- | --- | --- |
| maze | `#9df0b0` | 134° | `#1fae6b` | 148° |
| suki | `#a8f0c0` | 142° | `#22b577` | 152° |
| lilly | `#2ee8c0` | 168° | `#9dfb57` | 88° |
| **amara 2.0** | **`#aef0dd`** | **163°** | **`#2f9b8e`** | **173°** |
| haru | `#8fe6ff` | 193° | `#1b82ea` | 209° |

O que separa a Amara das três vizinhas não é o matiz sozinho — é o
**par matiz + luminosidade + papel**:

- **Maze e Suki** são verdes **vegetais** (134°–152°), de folha e de
  broto. A Amara fica 15°–20° acima, no verde que já virou água.
- **Lilly** é turquesa **neon** saturada sobre lima — cor de palco. O
  claro da Amara tem luminosidade 81% e o escuro é um teal fosco de
  39%: água-marinha leitosa, não néon.
- **Haru** é ciano **azulado** (193°+). A Amara para antes do azul.

Fronteiras de vocabulário, não de cor:

- **vegetação é da Maze** (traje `jardim`, Deusa da Natureza). O
  Criador escolheu **halo**, não a coroa de flores da arte — e isso
  mantém a Amara longe do vocabulário botânico. Nenhuma folha, nenhum
  broto, nenhuma flor entra em peça nenhuma deste marco.
- **anéis orbitais inclinados são da Nexara**. O halo da Amara é um
  nimbo **frontal e estático**, sem órbita e sem inclinação.
- **ouro em massa é da Saturno** — e a Amara está saindo justamente do
  dourado, o que afasta as duas em vez de aproximá-las.
- **vidro líquido em peça inteira é da Luma**; aqui o vidro é a base do
  vestido, como no `jardim` e no `aurora`, com `Finish.Holo` reservado
  ao nimbo e aos fios de luz.

---

## 4. O que será construído

Três identificadores novos, nenhum reaproveitado:

### 4.1 Penteado `nascente`

O nome é o da água que brota — vida que começa, e a leitura do cabelo
claro e corrente da arte.

- Queda do topo do crânio até **`y ≈ −0,03`** (altura do quadril):
  mais longo que qualquer penteado do catálogo, como na referência.
- Perfil que abre no ombro e afina na ponta, **passando por cima da
  calota compartilhada** de `buildHair` — a calota é de todos os
  dezesseis penteados e não será tocada (lição da Júpiter).
- Raio **raso na linha do olhar**: a frente do rosto está em
  `z = 0,2089`, e cabelo que avança ali engole a cara.
- **Duas mechas frontais** caindo sobre os ombros, que é o que a arte
  mostra e o que nenhum penteado do catálogo tem hoje.
- Degradê de **matiz**, com `tint`: raiz mais fechada, pontas acendendo
  no verde-água da paleta.
- Ondulação por `feature()` — relevo que custa zero triângulo — com
  ruído determinístico e **cerca de distância da cabeça**, para não
  repetir o empurrão que deformou o rosto da Akemi.

### 4.2 Traje `regaco` — "Manto Regaço"

Regaço é o colo que acolhe. O traje é o manto que o Criador escolheu.

- **Base**: vestido de vidro verde-água, saia longa `GOWN_HEM_Y`
  (`−0,46`), que varre o chão como na arte.
- **Ombros nus** (`bareArms`), como a referência mostra.
- **Gola alta** fechada no pescoço, com fio de luz descendo ao peito —
  toda ela **acima de `y = 0,36`**, fora da banda do ventre, que é onde
  pedraria pode existir sem ser esticada.
- **O manto**: duas abas que nascem na linha dos ombros, descem pela
  frente **contornando o ventre** e fecham numa faixa logo **abaixo**
  dele, em `y ≈ −0,05` — zona segura, ganho de 0,0015. É o abraço:
  o pano envolve e sustenta, sem cruzar rígido o ponto que cresce.
- **Nas costas o manto é estreito** — duas faixas verticais nos flancos,
  deixando a coluna livre. A lição do véu da Nexara é explícita: a
  malha é opaca, e pano largo nas costas apagaria o cabelo longo, que
  aqui é peça principal.
- **Linhas de continuidade**: nervuras finas de luz subindo da barra,
  acompanhando a saia — vida que segue adiante, sem nenhum símbolo
  literal.

### 4.3 Acessório `nimbo`

O Panteão inteiro já tem uma auréola: um toro dourado (`HALO_DEFAULT`,
`0xfff2a8`) que `Avatar.ts` cria para toda divindade. Ela é
compartilhada e **não será alterada** — só a cor dela, pelo campo
`halo?: number` que a ficha já prevê e que nenhuma personagem usa
ainda.

O acessório é outra coisa, e precisa ser:

- Um **nimbo vertical** atrás da cabeça, no plano do rosto — a auréola
  de ícone, que de frente emoldura e de perfil é um traço fino.
- Arco **parcial**, aberto embaixo, para passar por fora do cabelo sem
  disputar espaço com ele.
- `Finish.Holo`, o único acabamento que emite luz própria: um nimbo que
  apaga na sombra é um aro de plástico.
- Contas de luz espaçadas no arco, só nos níveis altos.

### 4.4 A ficha

| campo | antes | depois |
| --- | --- | --- |
| `colors` | `['#ffe9a6', '#c79a3a']` | `['#aef0dd', '#2f9b8e']` |
| `aura` | `0xffe9a6` | `0x9fe8d8` |
| `halo` | (ausente → dourado) | verde-água |
| `hairStyle` | `longo` | `nascente` |
| `hairColor` | `#2b1d16` | claro, como na arte |
| `outfit` | `aero` | `regaco` |
| `accessory` | `nenhum` | `nimbo` |

**Pele e olhos ficam.** `#7d4a2c` e `#c98a2b` são identidade dela, e o
âmbar do olho é o único ponto quente de um visual que, sem ele, vira
monocromático.

---

## 5. Plano de LOD e orçamento

| LOD | hoje | teto do elenco | alvo |
| --- | --- | --- | --- |
| baixa | 8 220 | 8 960 (luma) | ≤ 8 900 |
| média | 12 948 | 16 080 (akemi) | ≤ 15 800 |
| alta | 20 330 | 32 530 (maze) | ≤ 26 000 |
| ultra | 66 224 | 81 620 (maze) | ≤ 79 000 |

Degradação por nível, como nos marcos anteriores:

- **baixa** — silhueta e cor: queda do cabelo, vestido, manto, nimbo
  como aro simples. Sem ondas, sem contas, sem nervuras.
- **média** (`segments ≥ 14`) — ondulação do cabelo, faixa do manto,
  fio da gola.
- **alta** (`segments ≥ 20`) — mechas frontais, nervuras da saia,
  volume do alto da cabeça.
- **ultra** — contas do nimbo e refino.

---

## 6. O que não será tocado

- **`longo` e `aero`** — as peças do Aérion. Assinaturas congeladas:
  `cabelo/longo` (`-696245283` / `1957761537` / `468444067` /
  `660377351`) e `traje/aero` (`-1380355939` / `-1819497154` /
  `-829800594` / `-1844529181`).
- **`panteao/aerion`** — `-207203644` / `-2133619781` / `-1523554040` /
  `-1119451934`, rosto `787622777`.
- A **calota** e a **franja** de `buildHair`, comuns aos dezesseis
  penteados.
- `buildSkirt` e o perfil de controle dela.
- A auréola `TorusGeometry(0,13, 0,016, 8, 28)` de `Avatar.ts`.
- `src/player/Gestation.ts` — a matemática do ventre não muda. O traje
  se adapta a ela, nunca o contrário.
- As fichas, geometrias e materiais das outras dez personagens.
- `CITIZEN_HAIR_STYLES`, `CITIZEN_OUTFITS` e `CITIZEN_ACCESSORIES`
  passam a excluir `nascente`, `regaco` e `nimbo`: peça de deusa não
  nasce em habitante sorteado.

---

## 7. Testes previstos

`tests/unit/amara-remaster.test.ts`, no molde dos 43 casos da Júpiter:

1. **Ficha** — paleta nova, aura, halo, e as três peças exclusivas.
2. **Exclusividade** — `nascente`, `regaco` e `nimbo` fora das três
   listas de habitante, e usadas por nenhuma outra personagem.
3. **Preservação** — Aérion segue em `longo`/`aero`; as peças dele
   continuam no catálogo e intactas.
4. **Gestação** — o traje convive com o ventre: nenhuma peça rígida
   dentro de `y ∈ [0,04 ; 0,32]`, e o pano do tronco declara zona.
5. **LOD** — as quatro malhas crescem com o nível e respeitam o teto.
6. **Silhueta** — comprimento do cabelo, barra da saia, nimbo acima da
   cabeça e atrás do rosto.
7. **Fronteira** — nada de folha, broto ou flor; nimbo sem órbita;
   paleta distinta de Maze, Suki, Lilly e Haru.

### Cinco casos de outros marcos terão de ser atualizados

A Amara era usada como **testemunha** de que as peças genéricas não
mudavam. Ao sair delas, a testemunha certa passa a ser o **Aérion**,
que continua vestindo as duas. A intenção dos testes é preservada; o
que muda é quem a comprova:

| arquivo | linha | o que afirma hoje |
| --- | --- | --- |
| `jupiter-remaster.test.ts` | 511 | `amara.colors` é o dourado |
| `jupiter-remaster.test.ts` | 556 | `amara.appearance.hairStyle === 'longo'` |
| `maze-remaster.test.ts` | 140 | idem |
| `maze-remaster.test.ts` | 575 | idem |
| `haru-remaster.test.ts` | 259 | `amara.appearance.outfit === 'aero'` |

Nenhum outro caso do repositório depende da aparência dela.

---

## 8. Validação

- `tools/assinaturas.ts` contra `/tmp/amara-antes.txt` (260 linhas,
  baseline `f38a2ec`): **só `panteao/amara` pode divergir**, zero
  assinaturas perdidas.
- Bancada nos quatro LODs: frente, perfil, costas, rosto e movimento.
  **O perfil é a vista crítica**, por causa do ventre.
- `npx tsc --noEmit`, build de produção e a suíte inteira.
- `docs/VALIDACAO-AMARA-2.0.md` com os números finais.

---

## 9. Riscos declarados

1. **O manto briga com o ventre.** Mitigado pela regra de ouro e pela
   zona declarada em cada peça. Será conferido no perfil, a cada rodada.
2. **O manto apaga o cabelo nas costas.** Mitigado por manter o manto
   estreito atrás — a lição do véu da Nexara.
3. **O verde encosta na Maze, na Suki ou na Lilly.** Mitigado por
   matiz, luminosidade e vocabulário; conferido em captura lado a lado
   se necessário.
4. **Cabelo claro sobre fundo claro some.** O céu da bancada é claro;
   será conferido nas capturas, e o degradê de ponta existe em parte
   por isso.
5. **Orçamento.** Medição a cada rodada; teto declarado na seção 5.

---

## 10. Autorização

O Criador autorizou a remasterização e respondeu às quatro questões de
direção. O PR ficará **aberto** para revisão: este marco não será
mesclado, e nenhum outro será iniciado depois dele.
