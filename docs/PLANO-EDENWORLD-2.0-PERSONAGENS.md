# EdenWorld 2.0 — Fase 1: personagens masculinos e femininos

**Documento de auditoria e plano. Nenhum arquivo do jogo foi alterado.**
Base: `main` em `7650efc` (Genesis 0.5). Branch: `arena/9893b8c5-edenworld`.

Tudo que está medido abaixo foi medido executando o código desta base, não
estimado. Onde eu não verifiquei, está escrito que não verifiquei.

---

## 1. Auditoria

### 1.1 Escala

| Diretório | Linhas | Maior arquivo |
| --- | --- | --- |
| `src/player/` | 10 658 | `body/BodyBuilder.ts` — 5 704 |
| `src/npc/` | 3 438 | `NpcSystem.ts` — 1 435 |
| `src/characters/` | 2 223 | `Pantheon.ts` — 1 340 |

Testes que já protegem esta área: **479**, em 19 arquivos (`avatar`, `npc-*`,
`afters-*`, `rosto-render`, `personagens-mundo` e as dez suítes `*-remaster`).

### 1.2 O achado principal: **não existe eixo de gênero, e o corpo base já é neutro**

Esta é a conclusão que muda o tamanho do trabalho. O sistema atual não é
"um sistema feminino" — é um sistema **sem sexo nenhum**, em que a leitura
feminina é produzida por quatro camadas separadas e removíveis:

1. **O perfil do tronco** — `buildTorso` empilha anéis com `m.waistWidth`,
   `m.chestWidth`, `m.hipWidth`. São raios paramétricos. **Não há geometria
   de busto no corpo base** — procurei: nenhum lobo, nenhum volume, nenhum
   anel dedicado.
2. **O morph Afters** — o volume do busto é `Zone.Bust`, aplicado em
   *tempo de execução* por um uniforme de shader (`setMorph(bust, curve)`),
   partindo de zero. Custa um `float`, não geometria.
3. **O catálogo** — penteados e trajes de leitura feminina em
   `AvatarAppearance.ts`.
4. **O rosto** — `buildFaceGeometry` puxa o lábio 50 % para `#c2566a` em
   **todo mundo**, sem exceção.

Consequência: o corpo masculino **não precisa de um pipeline novo**. Precisa
de uma tabela de silhueta própria, um rosto próprio, cabelos próprios e
roupas próprias — rodando na mesma máquina.

### 1.3 O rig é neutro e reaproveitável

- `BONE_COUNT = 19`; as proporções **não movem osso nenhum** — o próprio
  módulo documenta que "os ossos continuam nos mesmos lugares proporcionais
  e uma pose serve para qualquer corpo".
- Logo: **nenhuma animação nova, nenhum rig novo, nenhum gesto novo.**
  Os gestos, as expressões e o `AvatarAnimator` servem os dois sexos como
  estão. Isto elimina a maior fonte possível de duplicação.

### 1.4 Roupa genérica é combinação de sinalizadores, não geometria

Os cinco trajes de habitante (`casual`, `aero`, `vestido`, `esportivo`,
`praia`) não têm geometria própria. São cinco booleanos sobre a mesma malha,
mais atribuição de cor por anel:

```
longSleeves  = aero | aurora | rede | sonora | cosplay | sistema
bareArms     = esportivo | vestido | guardia | jardim | lumen | regaco
longPants    = casual | aero | rede | sistema
bareLegs     = vestido | docente | cosplay | guardia | jardim | lumen | regaco
dress        = vestido | aurora | docente | sonora | ...
```

Camiseta, regata, calça e bermuda masculinas são, em sua maior parte, **novas
combinações destes sinalizadores** — custo de geometria perto de zero. Os oito
trajes de deusa, por contraste, têm função dedicada cada um (`buildNetSuit`,
`buildCosplaySuit`, `buildGuardiaSuit`, `buildSystemSuit`, `buildLumenSuit`,
`buildGardenSuit`, `buildSonoraSuit`, `buildRegacoSuit`).

### 1.5 O catálogo de habitante é raso — e o de deusa é fundo

Custo em linhas de cada penteado, medido:

| Penteados de habitante | Linhas | Penteados de deusa | Linhas |
| --- | --- | --- | --- |
| `longo` | 10 | `nascente` (Amara) | 372 |
| `ondulado` | 61 | `copa` (Maze) | 332 |
| `rabo` | 10 | `fibra` (Haru) | 216 |
| `coque` | 5 | `fluxo` (Nexara) | 185 |
| `cacheado` | 13 | `onda` (Lilly) | 169 |
| `espetado` | 105 | `cachos` (Akemi) | 166 |
| `curto`, `careca` | — | `pincelada`, `cascata`, `silvestre` | 157 / 85 / 81 |
| **total** | **204** | **total** | **1 763** |

**Oito penteados para a cidade inteira, 204 linhas somadas.** É aqui que
mora a "repetição excessiva" — não no algoritmo de sorteio, mas no tamanho
do baralho.

### 1.6 As deusas não têm corpo escrito à mão

`officialProportions(id)` chama `proportionsFor(id, height)` — **o mesmo hash
FNV-1a dos habitantes comuns**. As dez remasterizadas derivam o corpo do
próprio id. Portanto:

> Qualquer alteração em `proportionsFor` ou em `bodyMetrics` altera as dez
> deusas de uma vez.

Há trava: `officialFingerprint()` e a suíte `personagens-mundo.test.ts`
comparam impressão digital por personagem. É a rede de segurança desta fase.

### 1.7 Falha preexistente encontrada: **a exclusividade das deusas está quebrada na cidade**

As listas `CITIZEN_HAIR_STYLES` / `CITIZEN_ACCESSORIES` existem e estão
corretas. **Quem gera a cidade real não as usa.** `makeCitizen()` sorteia de
`HAIR_STYLES` e `ACCESSORIES` cheias.

Executei a geração dos 54 habitantes de Aurora City:

```
população: 54 | penteados no catálogo: 17 | permitidos a habitante: 8

VAZAMENTO DE PEÇA DE DEUSA NA CIDADE:
  cabelo   : fluxo×8  silvestre×5  pincelada×4  onda×4  copa×4
             nascente×3  cascata×3  cachos×2  fibra×1     → 34 de 54
  acessório: atelie×4  lentes×1  nimbo×1                   →  6 de 54
  traje    : nenhum
```

**34 dos 54 habitantes de Aurora City usam cabelo de deusa.** Oito pessoas
andam pela praça com o cabelo da Nexara, anéis orbitais inclusive; três com
a Nascente da Amara.

Por que nenhum teste pegou: as dez suítes `*-remaster` afirmam
`expect(CITIZEN_HAIR_STYLES).not.toContain('cachos')` — travam **a
constante**, nunca o que `makeCitizen` devolve. A lista está certa; o
consumidor a ignora.

Isto é preexistente, não foi introduzido aqui, e cai exatamente sobre dois
pedidos seus: proteger as deusas e evitar repetição. Está na decisão **D1**.

### 1.8 Os nomes já têm gênero; a aparência não sabe disso

`FIRST_NAMES` tem 41 nomes, muitos inequívocos — Benício, Enzo, Miguel,
Rafael, Gael, Otávio, Théo, Davi ao lado de Alícia, Helena, Sofia, Fernanda.
A aparência é sorteada sem nenhuma correlação com o nome:

```
Rafael Brisa          ondulado   casual
Benício do Orvalho    ondulado   esportivo
Vega das Águas        pincelada  casual
```

Um eixo de sexo derivado do nome conserta isto **sem gastar sorteio**.

### 1.9 O rosto é uma malha única, para todo mundo

`buildFaceGeometry(appearance)` recebe só a aparência — **não recebe as
proporções**. É malha separada, pendurada no osso da cabeça e escalada por
`headSize`. O queixo e a mandíbula vêm de outro lugar: `faceShape` no crânio,
dentro de `buildHead` (`jaw = 0.56 + round * 0.22`).

Bom para nós: variar o rosto masculino é barato e isolado.

### 1.10 Orçamento de vértices (medido, traje `aero`)

| Nível | Vértices |
| --- | --- |
| ultra | 36 050 |
| alta | 11 163 |
| media | 6 935 |
| baixa | 4 263 |

O corpo masculino tem de pousar **nestes mesmos números**, nível a nível.
É critério de aceitação, não meta.

### 1.11 O criador de personagem hoje

Dez grupos de controle: pele, estilo e cor de cabelo, olhos, roupa, três
cores de roupa, acessório, altura. **Nenhum controle de proporção corporal**
e nenhum seletor de sexo. Já existe `onPreview(appearance)` — a visualização
em tempo real está pronta e é onde o seletor novo se encaixa.

---

## 2. Arquivos envolvidos

**Mudam (ordem de risco crescente):**

| Arquivo | O quê |
| --- | --- |
| `src/player/body/BodyShape.ts` | **novo** — tabela de silhueta por sexo |
| `src/player/AvatarAppearance.ts` | campo `sex`, catálogos por sexo, novos penteados/trajes |
| `src/player/body/BodyRig.ts` | `bodyMetrics(p, shape = FEM)` — argumento com padrão |
| `src/player/body/BodyBuilder.ts` | silhueta masculina, cabelos e roupas novos |
| `src/player/AvatarFace.ts` | deltas de rosto masculino |
| `src/player/Avatar.ts` | repassar o sexo ao construir corpo e rosto |
| `src/npc/CitizenData.ts` | sexo derivado do nome; catálogos por sexo; **conserto do vazamento** |
| `src/interface/AvatarCreator.ts` | seletor masculino/feminino; ganchos EdenPhone/EdenCloset |

**Não mudam, e são a prova de que nada regrediu:**

`src/characters/Pantheon.ts` · `src/characters/CharacterModels.ts` ·
`src/player/body/BodyProportions.ts` · `src/player/AvatarAnimator.ts` ·
`src/player/Gestures.ts` · `src/player/Expressions.ts` ·
`src/afters/*` · `src/systems/SaveSystem.ts` · todo o `src/render/`.

---

## 3. Arquitetura proposta

### 3.1 O princípio, e a tensão que ele resolve

Você pediu duas coisas que puxam para lados opostos: **identidade visual
própria** para o masculino e **nenhuma duplicação desnecessária**. A linha
que as concilia:

> **A máquina é compartilhada. As tabelas são próprias.**

Compartilhado: o rig de 19 ossos, o `SurfaceBuilder`, o sistema de
varredura de perfis, o atributo de morph, o material único, as animações,
os gestos, os quatro níveis de detalhe. Próprio do masculino: a tabela de
silhueta, o conjunto de penteados, o conjunto de roupas, os deltas de
rosto. O masculino não é o feminino com números trocados — é o seu próprio
conjunto de tabelas entrando no mesmo motor.

### 3.2 Onde o sexo mora

**Em `AvatarAppearance`, não em `BodyProportions`.** Três razões:

1. `AvatarAppearance` já é salva e `sanitizeAppearance` já cai no padrão
   campo a campo — **saves antigos abrem como femininos, sem bump de
   `SAVE_VERSION`**, que continua 3.
2. `BodyProportions` é módulo puro e numérico, e tem `mixProportions` —
   interpolar entre dois corpos. Não se interpola um sexo. Pôr o campo lá
   tornaria essa função incoerente.
3. `proportionsFingerprint` não muda ⇒ **a impressão digital das dez deusas
   não muda**.

```ts
export const SEXES = ['fem', 'masc'] as const;
export type Sex = (typeof SEXES)[number];
// em AvatarAppearance: sex: Sex;  // padrão 'fem'
```

### 3.3 A silhueta: `BodyShape.ts` (módulo novo)

`bodyMetrics(p)` ganha um segundo argumento **com valor padrão feminino**:

```ts
export function bodyMetrics(p: BodyProportions, shape: BodyShape = SHAPE_FEM): BodyMetrics
```

Todos os chamadores existentes continuam compilando e produzindo **os mesmos
números bit a bit**. É isto que mantém as deusas intactas por construção, e
não por cuidado.

O perfil masculino muda o que define a silhueta masculina de verdade:
ombro mais largo, quadril mais estreito, cintura mais alta e menos marcada,
caixa torácica mais profunda, pescoço mais grosso, membros proporcionalmente
mais longos, mandíbula mais larga. Nenhum anel a mais — os mesmos anéis em
raios diferentes.

### 3.4 O busto no corpo masculino — decidido (D3)

Como o volume vem de um uniforme de shader e não da malha, o corpo masculino
nasce com `bust = 0`, `bustActive = false`, e **fica fora da linha Afters**.

Custo: zero. Nenhum canal novo, nenhuma banda de morph nova, nenhuma alteração
nos 92 testes de `afters-*`. Em `rollCitizenAfters`, o habitante masculino
devolve corpo zerado **antes** do primeiro `rng()` — e como esse bloco é o
último de `makeCitizen`, sair mais cedo não desloca sorteio nenhum.

### 3.5 Catálogos por sexo, sem remover nada

```ts
FEM_HAIR  = [...tudo que existe hoje]          // nada sai
MASC_HAIR = [curto, espetado, ...4-5 novos]    // novos, próprios
UNISEX    = [careca, calçados, óculos, acessórios, esportivo]
```

Mesmo desenho para trajes. `HAIR_STYLES` e `OUTFITS` continuam sendo a união
de tudo — **nenhuma entrada é removida**, nenhum save quebra, nenhuma deusa
perde peça. O sexo apenas **filtra o que é oferecido e sorteado**.

### 3.6 NPCs: sexo derivado do nome, não sorteado

Inserir um sorteio no meio de `makeCitizen` deslocaria a sequência do RNG e
**trocaria a aparência de todos os habitantes existentes** — o código avisa
disso em comentário. Em vez disso: uma tabela `NAME_SEX` marcando cada nome
de `FIRST_NAMES`, e o sexo **sai do nome já sorteado**. Zero sorteios novos,
e de quebra conserta Rafael de cabelo ondulado.

Para chegar aos ~50/50 da **D2**, a divisão é feita na tabela de nomes —
equilibrando `FIRST_NAMES` entre masculinos e femininos — e não por um
sorteio de sexo. A proporção vira propriedade dos dados, verificável por
teste, em vez de um número solto no meio do código.

E, pela **D1**, `makeCitizen` passa a sortear das listas `CITIZEN_*`
filtradas por sexo. Isso devolve ao panteão os nove penteados e três
acessórios que hoje vazam para a praça.

### 3.7 Criador de personagem

Um grupo novo no topo — **Masculino / Feminino** — que refiltra os grupos
abaixo e dispara o `onPreview` que já existe. Os ganchos para EdenPhone e
EdenCloset entram como um módulo de catálogo consultável (`catalogFor(sex)`),
para que as duas telas futuras leiam a mesma fonte.

---

## 4. Riscos

| # | Risco | Gravidade | Mitigação |
| --- | --- | --- | --- |
| R1 | **Alterar as dez deusas sem querer** — elas derivam o corpo de `proportionsFor`/`bodyMetrics`, compartilhados | **Alta** | Argumento com padrão feminino ⇒ identidade bit a bit. `officialFingerprint` trava item a item antes e depois |
| R2 | **Quebrar saves** | Média | Campo novo com padrão em `sanitizeAppearance`; `SAVE_VERSION` fica em 3; teste com save v1/v2/v3 sem o campo |
| R3 | **Deslocar o RNG e trocar a cidade inteira** | Média | Sexo derivado do nome, não sorteado; zero chamadas novas de `rng()` antes do bloco Afters |
| R4 | **Estourar o orçamento de vértices** | Média | Roupa masculina por sinalizador, não por geometria; medição nos 4 níveis contra 36 050 / 11 163 / 6 935 / 4 263 |
| R5 | **Roupa deformando ou atravessando o corpo** — `PELVIS_PROFILE` é lida **pelo corpo e pela saia** | **Alta** | A saia continua lendo o perfil feminino; a pelve masculina não entra nessa tabela. Teste de contenção: nenhum vértice de roupa dentro do raio do corpo |
| R6 | **Busto em corpo masculino** pelo morph Afters | Média | `bust = 0`, `bustActive = false`; decisão D3 |
| R7 | **Consertar o vazamento muda a cidade visivelmente** — 34 habitantes trocam de cabelo | Média | Aprovado em **D1**. Risco derivado: o baralho encolhe e surgem clones — coberto pelo escopo de catálogo do §8 e pelo limiar de repetição na etapa 7 |
| R8 | Regressão em WebGL2 / celular / PBR / PMREM | Baixa | Nenhum material, shader, textura ou passe novo; o masculino usa o material único existente |
| R9 | `BodyBuilder.ts` já tem 5 704 linhas; crescer demais | Baixa | Cabelo e roupa masculinos em módulo próprio, no mesmo padrão dos trajes de deusa |

---

## 5. Plano de implementação

Etapas pequenas, cada uma verificável sozinha. **As etapas 1 e 2 não mudam
um pixel** — são andaimes com rede de segurança.

| Etapa | O quê | Visível? |
| --- | --- | --- |
| **0** | Decisões D1–D3 com você | — |
| **1** | Eixo de sexo nos dados: `Sex`, campo em `AvatarAppearance`, `sanitizeAppearance`, padrão `'fem'` | **Não** |
| **2** | `BodyShape.ts` + `bodyMetrics(p, shape = SHAPE_FEM)`; perfil masculino escrito mas **não ligado** | **Não** |
| **3** | Ligar a silhueta masculina no `Avatar`; primeira captura de corpo masculino | Sim |
| **4** | Rosto masculino: mandíbula, lábio, sobrancelha, `faceShape` | Sim |
| **5** | Penteados: **5–6 masculinos novos** + **2–3 femininos genéricos novos** (§8) | Sim |
| **6** | Vestuário: camiseta, regata, calça, bermuda de banho + unissex | Sim |
| **7** | NPCs: sexo pelo nome, `FIRST_NAMES` em ~50/50, catálogos por sexo, **conserto do vazamento**, peso de `careca` | Sim |
| **8** | Criador: seletor de sexo, refiltro, ganchos EdenPhone/EdenCloset | Sim |
| **9** | Regressão completa, capturas lado a lado, documentação | — |

Cada etapa termina com: suíte verde, `npm run build` limpo, e — das 3 em
diante — captura de tela. Nada segue para a etapa seguinte com a anterior
vermelha.

---

## 6. Testes

### 6.1 Não-regressão (rodam em **todas** as etapas)

- **As 479 existentes desta área, verdes do começo ao fim.** Em especial as
  dez suítes `*-remaster` e `personagens-mundo.test.ts`.
- **A suíte inteira: 1 394 testes.** Linha de base conhecida desta `main`:
  1 382 passando, 1 falhando (`coracao-roseiral`, preexistente e já provada
  na `main`), 11 pulados. Qualquer número diferente é regressão nossa.
- `npm run build` sem erro de TypeScript.

### 6.2 Travas novas, por etapa

**Etapa 1 — dados**
- Save sem o campo `sex` abre e vira `'fem'`; v1, v2 e v3 idem.
- Valor inválido (`"outro"`, `null`, número) cai no padrão.
- `proportionsFingerprint` das dez deusas **idêntico** ao de antes.

**Etapa 2 — silhueta (a trava mais importante)**
- `bodyMetrics(p)` sem segundo argumento devolve **exatamente** os mesmos
  números de hoje, para as 11 medidas, em amostra de proporções variadas.
- `officialFingerprint(id)` das dez deusas inalterado, item a item.
- O perfil masculino difere do feminino nas medidas que devem diferir
  (ombro, quadril, pescoço) — prova de que tem identidade própria.

**Etapa 3 — corpo**
- Vértices nos 4 níveis ≤ os números femininos medidos (36 050 / 11 163 /
  6 935 / 4 263).
- Malha sem autointerseção nas faixas de proporção extremas.
- Os 19 ossos nas mesmas posições relativas ⇒ as poses continuam válidas.

**Etapa 4 — rosto**
- Olhos, boca e sobrancelha dentro da superfície do crânio masculino.
- O lábio masculino não recebe o puxão de 50 % para vermelho.

**Etapa 5 — cabelo**
- Cada penteado masculino cobre o crânio sem deixar couro à mostra.
- Nenhum penteado masculino entra nas listas das deusas, e vice-versa.

**Etapa 6 — roupa**
- **Contenção:** nenhum vértice de roupa dentro do raio do corpo, em todas
  as combinações sexo × traje × proporção extrema.
- Cada peça pinta a região que promete (regata deixa ombro nu; bermuda
  termina acima do joelho).
- A saia e o vestido femininos continuam byte a byte iguais.

**Etapa 7 — NPCs**
- **Vazamento zero:** varrer os 54 habitantes e afirmar que nenhum usa
  cabelo, traje ou acessório fora das listas `CITIZEN_*`. É o teste que
  faltava — afirma sobre `makeCitizen`, não sobre a constante.
- Sexo do habitante bate com o gênero do nome, nos 54.
- Distribuição masculino/feminino entre 45 % e 55 % (D2).
- **Repetição:** nenhum penteado e nenhum traje em mais de **4** habitantes
  do mesmo sexo — hoje o pico seria 11 (§8). O teste falha se o catálogo
  não tiver crescido o bastante.
- `careca` em no máximo 2 habitantes.
- Determinismo: `makeCitizen(n)` devolve o mesmo habitante em duas
  execuções e entre regiões.

**Etapa 8 — criador**
- Trocar de sexo refiltra as listas e mantém o que é unissex.
- Trocar de sexo e voltar não perde a escolha anterior.
- `catalogFor(sex)` responde o mesmo que as listas usadas pelo criador —
  a fonte única que EdenPhone e EdenCloset vão consumir.

**Etapa 9 — visual**
- Capturas: jogador masculino e feminino lado a lado; praça com a
  população mista; as dez deusas na fila do panteão, comparadas com
  `docs/panteao-genesis-0.5.png` — **têm de estar idênticas**.

---

## 7. Decisões tomadas

| | Decisão | Efeito |
| --- | --- | --- |
| **D1** | **Consertar o vazamento junto** | `makeCitizen` passa a respeitar as listas `CITIZEN_*`. 34 habitantes trocam de cabelo e 6 de acessório — mudança visível e intencional |
| **D2** | **~50/50 em Aurora City** | 27 masculinos / 27 femininos, equilibrados na tabela `FIRST_NAMES` |
| **D3** | **Masculinos fora da linha Afters** | `bust = 0`, `bustActive = false`; nenhum canal ou banda de morph novo |

---

## 8. Consequência das decisões: o catálogo **tem** de crescer

D1 e D2 juntas criam um problema aritmético que não existia antes, e é melhor
enxergá-lo agora do que na etapa 7. Medi os dois cenários:

**Cenário A — consertar o vazamento, sem eixo de sexo.** Os 8 penteados de
habitante para 54 pessoas:

```
curto×11  rabo×9  ondulado×7  careca×7  cacheado×7  espetado×6  coque×4  longo×3
pico: 11 pessoas com o mesmo cabelo — 20% da cidade
```

**Cenário B — conserto + 50/50, com o catálogo atual.** Repartindo os 8
penteados por plausibilidade (masculino: `curto`, `espetado`, `careca`;
feminino: os outros mais `curto` e `careca`):

| | Opções | Habitantes | Repetições por penteado |
| --- | --- | --- | --- |
| masculino | 3 | 27 | **9,0** |
| feminino | 7 | 27 | 3,9 |

**Nove homens idênticos da cabeça para cima.** O mesmo vale para a roupa:
`CITIZEN_OUTFITS` tem 5 trajes, um deles `vestido` — sobram **4** para os 27
masculinos.

Ou seja: consertar o vazamento sem encher o baralho troca um problema
(deusas duplicadas) por outro (clones). O catálogo masculino das etapas 5 e 6
deixa de ser enfeite e vira **requisito de correção**:

| Acréscimo | Repetições resultantes |
| --- | --- |
| +4 penteados masculinos | 3,9 |
| **+5 penteados masculinos** | **3,4** |
| +6 penteados masculinos | 3,0 |
| +2 penteados femininos | 3,0 |
| **+3 penteados femininos** | **2,7** |

**Escopo fechado a partir disto:** 5–6 penteados masculinos novos e 2–3
penteados femininos **genéricos** novos (novos mesmo — nenhum vindo das
deusas, que continuam exclusivas), mais os 4 trajes masculinos. Isso põe
toda a cidade em ~3 repetições por peça, contra o pico atual de 11.

Também vale registrar: `careca` aparecendo 7 vezes é 13% da cidade sem
cabelo. Na etapa 7 ele deixa de ter o mesmo peso dos outros no sorteio.
