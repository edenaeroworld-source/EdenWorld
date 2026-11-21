# Validação — Júpiter 2.0

A Júpiter é a **nona e última** deusa do Panteão a ser remasterizada.
Este documento registra o que foi construído, o que foi medido e o
que a bancada derrubou pelo caminho.

O plano do marco está em [`PLANO-JUPITER-2.0.md`](PLANO-JUPITER-2.0.md),
escrito e aprovado **antes** de qualquer geometria.

---

## 1. O que ela era

| campo | antes | depois |
| --- | --- | --- |
| `hairStyle` | `cacheado` (de habitante) | **`pincelada`** (exclusivo) |
| `outfit` | `vestido` (de habitante) | **`lumen`** (exclusivo) |
| `accessory` | `nenhum` | **`atelie`** (exclusivo) |
| `topColor` | `#ff9f43` | `#f7f2ee` |
| `bottomColor` | `#2e3a4f` — **invisível na malha** | `#ffb199` |

Tudo o mais da ficha saiu intacto: `title`, `domain`, `colors`
(`#ffb199`, `#c0392b`), `aura` (`0xff9f6a`), `tagline`, `place`
(Pavilhão Lumen), `contact`, `journal`, diálogos, `skin`, `eyeColor`
e `height`.

Ela era **a única deusa com os dois campos de peça compartilhados ao
mesmo tempo**: nada na aparência dela era dela.

## 2. As três peças

### `pincelada` — o penteado

Queda longa e ondulada até quase a cintura (`y = 0,158`), seção funda
atrás e rasa na frente, ondas de relevo que custam **zero triângulo**
(`feature()` empurra vértices que já existem) e vermelho que escurece
na raiz e acende na ponta.

O `cacheado` que ela deixou **não foi corrigido**, embora tenha o
mesmo defeito estrutural da `flor` da Maze — subdivisão fixa, 1 170
triângulos no LOD baixo e só 4 284 em ultra. É peça de habitante:
consertá-la mudaria gente que não está em marco. A Júpiter é que saiu
dele, como Maze, Haru e Saturno saíram das suas.

### `lumen` — o traje

O nome vem do **Pavilhão Lumen**, a galeria dela, que já era canônico
na ficha. Três camadas: o drapeado claro, a **faixa de cor** que
desce do ombro ao quadril carregando o gradiente pêssego → laranja →
vermelho, e os **fios de ouro** que debruam as bordas dela. Mais a
faixa de cintura, três pontas soltas caindo pela saia, pregas de
relevo no pano e cinco nervuras `Finish.Holo` que acendem à noite.

### `atelie` — o acessório

Gargantilha em **anel completo** (lição da Lilly: peça só na frente
não lê como colar), braceletes nos dois pulsos e brincos curtos. Tudo
em fio fino.

## 3. A fronteira cromática

A vizinhança da Júpiter é a mais apertada do elenco: Saturno
(`#ffd98a`, `#e08a2f`) e Amara (`#ffe9a6`, `#c79a3a`) ocupam o dourado
quente.

| | paleta | matéria |
| --- | --- | --- |
| Saturno | `#ffd98a` · `#e08a2f` | ouro **em massa** — galhada, folha, pata |
| Amara | `#ffe9a6` · `#c79a3a` | dourado suave |
| **Júpiter** | **`#ffb199` · `#c0392b`** | **vermelho**, fita lisa, ouro só em fio |

O teste `é ouro em fio, nunca ouro em massa` fixa isso na malha: o
ouro é menos de 10% dos vértices. O teste `não invade a Maze` prova
que não há um só vértice verde.

## 4. A bancada — treze rodadas

As capturas são o registro de por que o código tem os números que
tem. O que foi derrubado:

| rodada | o que se tentou | por que caiu |
| --- | --- | --- |
| 1 | fita com a largura tangente ao anel horizontal, torção reiniciando a cada trecho | serrilha que lia como **folha de palmeira** — a leitura que a fronteira com a Saturno proíbe |
| 1 | mechas douradas no cabelo, em toda a volta | uma **atravessou a boca**: o raio da frente é raso de propósito na altura do rosto |
| 2–3 | fita de raio **circular** no tronco | o torso do Éden é uma **elipse de 2,3 : 1** (`rx 0,2485` × `rz 0,1002`): a fita boiava à frente do peito e sumia dentro do pano nas laterais |
| 3 | meia volta diagonal, fina, com o ouro no meio | leu como **alça de bolsa a tiracolo**, com o fio de ouro de zíper |
| 4 | espiral de 2,5 voltas horizontais | cintas paralelas ao chão leem como as argolas de um barril: a deusa virou **múmia** |
| 5 | pontas soltas nas laterais | caíram exatamente **por cima das mãos** |
| 7 | mechas douradas recuadas para os lados | apareceram **esverdeadas** sobre o vermelho — cor proibida pela fronteira; foram cortadas de vez |
| 7 | ondas de relevo em anéis alinhados, volume de `R · 1,40` | de costas, o cabelo lia como **colmeia** |
| 8 | ponta do cabelo afinando a `R · 0,60` | a sonda media cabelo até `y = 0,158`, mas nas capturas ela parecia de **cabelo curto**: comprimento que não se vê não é comprimento |
| 10 | faixa de cintura descendo enquanto girava | as pontas não se encontravam: sobrava uma **tampa vermelha solta** na frente do quadril |
| 12 | bracelete posicionado a partir de `m.legX` | `legX` é a abertura das **pernas**: na captura **andando**, um aro dourado solto no meio da saia |

Duas lições herdadas se confirmaram na prática: relevo pedido em
1,2 cm **não aparece** (as pregas da saia precisaram de 2,4 cm), e
superfície plana e larga lê como cartolina — por isso cada trecho de
fita é um prisma fechado com espessura e torção, nunca um plano.

## 5. Orçamento

Triângulos do avatar inteiro, nos quatro níveis:

| | baixa | média | alta | ultra |
| --- | --- | --- | --- | --- |
| **Júpiter antiga** (`cacheado` + `vestido`) | 8 834 | 14 318 | 21 934 | 69 676 |
| **Júpiter 2.0** | **8 140** | **13 838** | 22 394 | 76 446 |
| diferença | **−694** | **−480** | +460 | +6 770 |

O LOD baixo é o que roda quando há multidão em cena, e é onde o
`cacheado` doía mais. Ela ficou **mais barata de longe e mais rica de
perto**, que era a meta do plano.

Custo marginal de cada peça nova (baixa → ultra): `pincelada`
460 → 9 680 · `lumen` −84 → 500 · `atelie` 100 → 874. São **três
malhas em todos os níveis**, e nenhuma peça tem contagem fixa: os
quatro níveis são quatro números diferentes, todos crescentes.

## 6. Validação

| verificação | resultado |
| --- | --- |
| `npx tsc --noEmit` | limpo |
| `npm run build` | ✓ em 589 ms |
| `tests/unit/jupiter-remaster.test.ts` | **43/43** |
| `tests/unit/saturno-remaster.test.ts` | 28/28 (duas asserções reescritas) |
| `tests/unit/maze-remaster.test.ts` | 39/39 (duas asserções reescritas) |
| `tests/unit/luma-remaster.test.ts` | ✓ |
| suíte geral | 1 326 passam · 11 puladas · **1 falha preexistente** |
| assinaturas de malha vs `0b14233` | **4 divergentes (todas `panteao/jupiter`) · 12 novas · 0 perdidas · 244 idênticas** |
| capturas | corpo, rosto, costas, perfil, andando, noite, LOD baixo — **nenhum erro de console** |

### A falha preexistente

`coracao-roseiral.test.ts > nenhum habitante nasce dentro, nem vai
parar lá em dois minutos de parque` falha **igual** no baseline
`0b14233`, provado com `git stash -u` e duas execuções limpas. Não
tem relação com este marco.

### As asserções reescritas

Três arquivos de marcos anteriores afirmavam que a Júpiter usava
`cacheado` e `vestido` — eles guardavam a regra de que **aqueles
marcos não podiam gastar o marco dela sem briefing**, e não gastaram.
Quem mudou esses dois campos foi o marco da Júpiter, com briefing
próprio e decisão do Criador. As asserções foram reescritas para
continuar provando o que importa: as peças que ela largou **seguem
inteiras no catálogo de habitantes**.

### O dano colateral que as assinaturas pegaram

Na nona rodada, um `replace` de `bottomY = cy - 0.52` casou com a
**primeira** ocorrência do arquivo — o `case 'ondulado'`, que é o
cabelo da **Luma**, marco já mesclado — em vez do da `pincelada`. A
suíte inteira continuou verde: a ficha da Luma não mudou, nem a
contagem de vértices, nem a de triângulos. Só as **posições** tinham
se deslocado, e o cabelo dela ficou oito centímetros mais longo.

`tools/assinaturas.ts` pegou na hora: `cabelo/ondulado`,
`panteao/luma` e nove habitantes apareceram como divergentes. É
exatamente o caso que fez a ferramenta existir, no marco da Haru.
Corrigido: a Luma voltou ao que era, e a `pincelada` recebeu o
alongamento que era dela.

---

## 7. O Panteão, completo

| deusa | penteado | traje |
| --- | --- | --- |
| Luma | `ondulado` | `aurora` |
| Suki | `cascata` | `docente` |
| Nexara | `fluxo` | `rede` |
| Lilly | `onda` | `sonora` |
| Akemi | `cachos` | `cosplay` |
| Saturno | `silvestre` | `guardia` |
| Haru | `fibra` | `sistema` |
| Maze | `copa` | `jardim` |
| **Júpiter** | **`pincelada`** | **`lumen`** |

Com este marco, **as nove deusas do Panteão têm peças próprias**. O
Aérion e a Amara seguem com o `longo`, intocados: nenhum dos dois teve
marco, e mexer neles aqui seria gastar um marco sem briefing.
