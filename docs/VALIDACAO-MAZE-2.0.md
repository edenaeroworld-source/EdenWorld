# Maze 2.0 — Remasterização Oficial · relatório de validação

Marco visual da **Maze, Deusa da Natureza**, dona da vegetação, dos
ecossistemas e dos ambientes botânicos do Éden Aero, moradora do
Parque das Águas.

O plano técnico aprovado antes de qualquer geometria está em
[`PLANO-MAZE-2.0.md`](./PLANO-MAZE-2.0.md). Este documento registra o
que foi construído, o que a bancada reprovou pelo caminho, e as provas
de que o resto do Éden saiu intacto.

---

## 1. O que a investigação encontrou antes de uma linha ser escrita

### 1.1 Os três campos de aparência dela eram compartilhados

A ficha antiga era:

```ts
look('#7d4a2c', 'longo', '#3fcf86', '#2f9a66', 'vestido', '#a8f0c0', '#1fae6b', '#f3ead6', 'flor', 1.03)
```

Nenhuma das três peças visuais era dela:

| peça | quem mais usa |
| --- | --- |
| `longo` | **Aérion, o Criador do Éden Aero**, e Amara |
| `vestido` | **Júpiter**, que ainda não teve marco |
| `flor` | habitantes sorteados |

Remasterizar `longo` teria repintado o Criador. Remasterizar `vestido`
teria gastado o marco da Júpiter sem briefing. Por isso a Maze ganhou
duas peças **novas e exclusivas** — `copa` e `jardim` — e as três
antigas voltaram inteiras para quem ficou.

### 1.2 A `flor` custava 912 triângulos e nunca cortava

Medido peça a peça, nos quatro níveis de detalhe:

| peça | baixa | média | alta | ultra |
| --- | --- | --- | --- | --- |
| `flor` | **912** | **912** | **912** | **912** |

Novecentos e doze triângulos iguais a cinquenta metros de distância,
para desenhar uma florzinha rosa de um centímetro **numa têmpora só**,
numa personagem de paleta verde. É o mesmo defeito que afundou o marco
da Saturno, e era a maior despesa isolada do avatar.

Ela foi trocada por uma coroa que nasce dentro do penteado: anel
completo, e corta por distância como todo o resto.

### 1.3 Ela era a segunda mais pesada do elenco no nível que importa

O teto do LOD baixo — o nível que roda em aparelho fraco e com muita
gente na tela — é **7 145,6** triângulos. A Maze estava em **7 024**:
121,6 de folga, a segunda pior do elenco inteiro.

### 1.4 A Saturno já é deusa de natureza, e já foi remasterizada

Duas deusas de natureza no mesmo elenco só funcionam se a cor e a
silhueta separarem as duas à distância. A fronteira acordada no plano,
e agora guardada por teste:

* **Maze é verde, pano e água viva** — folha de tecido, seiva acesa,
  gota de vidro. Sem galhada, sem ouro, sem folha de vidro;
* **Saturno é ouro, vidro e estação seca.**

---

## 2. As decisões que o Criador tomou

Quatro perguntas de direção, respondidas antes da implementação:

| pergunta | resposta |
| --- | --- |
| cabelo verde da ficha ou juba castanha da arte? | **a arte** |
| manter a `flor` ou trocar por coroa própria? | **trocar** |
| marcas bioluminescentes no rosto? | **não** |
| traje menta da ficha ou branco translúcido da arte? | **a arte** |

O cabelo deixou de ser verde (`#3fcf86` → `#a8702f`), e o verde não se
perdeu: migrou para as folhas, os brotos acesos e a folhagem do traje.
A paleta canônica `colors` não foi tocada.

---

## 3. A ficha, antes e depois

| campo | antes | depois |
| --- | --- | --- |
| `hairStyle` | `longo` *(compartilhado)* | **`copa`** *(exclusivo)* |
| `hairColor` | `#3fcf86` | `#a8702f` |
| `outfit` | `vestido` *(compartilhado)* | **`jardim`** *(exclusivo)* |
| `topColor` | `#a8f0c0` | `#eef9ef` |
| `bottomColor` | `#1fae6b` | `#2fa36a` |
| `accessory` | `flor` *(compartilhado)* | `nenhum` |
| `skin` · `eyeColor` · `shoeColor` · `height` | — | **inalterados** |

Preservado e verificado por teste: `title`, `domain`, `aura`
(`0x7df0a8`), `colors` (`['#9df0b0', '#1fae6b']`), `tagline`, `place`,
`contact`, e os nós de diálogo.

---

## 4. O que foi construído

### 4.1 Penteado `copa` — "Copa de Árvore"

Uma juba cacheada volumosa, construída como **esfera** e não como
queda: cabelo afro-texturado cresce para fora, e o raio maior fica na
altura das orelhas.

* **cachos** por relevo (`feature`), que custa zero triângulo;
* **tufos** de volume próprio nos dois níveis de perto, porque relevo
  sozinho não recorta silhueta;
* **folhas de pano** espalhadas sem padrão pela massa;
* **coroa** de folhas e três flores na linha da testa, substituindo a
  `flor`;
* **brotos acesos** (`Finish.Holo`), poucos e sem simetria;
* **pontas de cacho** sobre a testa.

### 4.2 Traje `jardim` — "Traje Jardim"

Vestido branco translúcido com a vida por cima:

* faixa de folhagem **diagonal** no peito, de um ombro à cintura
  oposta;
* **gola** de folhas em anel completo;
* **nervuras** acesas acompanhando a faixa;
* cinta de vinha na cintura;
* **cascata de folhagem** descendo do quadril à barra, como hera;
* **gotas de água** (`Finish.Glass`), o único vidro da peça;
* folhas na barra da saia.

---

## 5. Orçamento

| nível | antes | depois | variação |
| --- | --- | --- | --- |
| **baixa** | 7 024 | **6 012** | **−1 012** |
| média | 12 020 | 13 876 | +1 856 |
| alta | 19 894 | 30 598 | +10 704 |
| ultra | 69 124 | 79 688 | +10 564 |

**Draw calls: 3 malhas, inalterado** (corpo, rosto, halo). Nenhuma peça
nova paga chamada de desenho — tudo é mesclado no corpo.

O nível que tem teto normativo é o **baixo**, e é o que melhorou: a
folga saltou de **121,6** para **1 133,6** triângulos. A Maze deixou de
ser a segunda mais pesada do elenco e passou a ser mais leve que
Júpiter, Luma, Lilly, Akemi, Suki, Nexara, Aérion e Amara.

Nos níveis de perto o custo subiu, e isso é deliberado: é onde moram os
tufos, as folhas e os brotos. Em `ultra` ela passou a ser a mais
pesada do elenco (79 688 contra 73 640 da Luma), nível que só é usado
em close de diálogo e não tem teto normativo. **Está registrado aqui
como o ponto a vigiar no próximo marco.**

---

## 6. As dez rodadas de bancada, e o que cada uma reprovou

Nenhum destes defeitos foi encontrado lendo código. Todos vieram de
olhar a imagem renderizada.

| # | o que a bancada mostrou | causa | correção |
| --- | --- | --- | --- |
| 1 | juba engolindo o rosto | perfil de queda longa aplicado a uma copa | esfera, com frente rasa |
| 2 | coroa atravessando as sobrancelhas | `t = 0,9` chutado em vez de calculado | `tDaTesta` resolvido pela altura |
| 3 | juba lisa como madeira polida | relevo pedido em `R · 0,055` = 11 mm | amplitude para `R · 0,3` |
| 4 | folhas como palitos verdes | largura `tam · 0,4` afinada a 25% nas pontas | barriga no meio, vinco pela nervura |
| 5 | folhas e gotas invisíveis na saia | raio 0,3497 herdado do marco da **Saturno** — barra errada | raio medido nesta saia: até **0,4084** |
| 6 | saia de bandeirinhas de festa junina | drapeado feito de trapézios planos | descartado |
| 7 | franja havaiana | pregas com bico, todas iguais | descartado |
| 8 | placas de papel coladas no quadril | pregas com barra arredondada | **drapeado de pano abandonado** |
| 9 | confete verde | folhas em três anéis regulares | cascata única, com composição |
| 10 | calota lisa e polida sobre a testa | `buildHair` desenha uma calota **compartilhada** antes do `switch` | franja com duas alturas, cobrindo-a |

### 6.1 O drapeado que não funcionou

A arte de referência mostra tecido verde caindo sobre o branco, e a
primeira intenção era reproduzi-lo como pano: pregas de tecido
descendo da cintura. Foi tentado três vezes — trapézios planos, pregas
com barriga e bico, pregas com barra arredondada e frente aberta — e as
três foram reprovadas na bancada.

A conclusão é sobre o motor, não sobre a arte: **superfície plana e
larga, sob luz difusa e sem textura, não lê como pano — lê como
cartolina.** O vocabulário que este render desenha bem é a folha com
volume próprio, que é o que o resto do Éden usa. A folhagem da arte
virou folhagem de verdade, em cascata.

### 6.2 A calota que não era minha para apagar

O defeito mais caro de diagnosticar. `buildHair` desenha uma calota
(`cap`) **antes** do `switch`, igual para os treze penteados, e ela
chega a `R · 0,92`. Como a juba da Maze é rasa na frente de propósito —
para o rosto respirar —, a calota ficava exposta ali, polida,
terminando numa aresta dura sobre as sobrancelhas.

Apagar a calota consertaria a Maze e quebraria os outros doze
penteados. Ela **não foi tocada**: a franja da `copa` passou a ter duas
alturas — funda acima da testa, para cobri-la; rasa na linha do olhar,
para o rosto respirar.

Medido, na faixa da testa:

| penteado | frente do cabelo |
| --- | --- |
| `coque`, `rabo`, `espetado` *(só a calota)* | 0,1695 |
| **`copa`** | **0,1964** |

---

## 7. Validação

### 7.1 Tipos

`npx tsc --noEmit` — **limpo**.

### 7.2 Build

`npm run build` — **✓ built in 880ms**.

### 7.3 Testes específicos da Maze

`tests/unit/maze-remaster.test.ts` — **39 casos, 39 passam.**

Cobrem: exclusividade das peças novas, ausência delas no sorteio de 60
habitantes, sobrevivência a `sanitizeAppearance`, cânone preservado,
juba que não engole o rosto, franja cobrindo a calota, relevo que
desloca a superfície sem deformar o crânio, coroa acima da linha dos
olhos, folhagem por fora do pano, gola em anel completo, assimetria da
faixa, vidro só nas gotas, fronteira com a Saturno, orçamento, três
malhas, corte por distância, e o resto do Éden intacto.

### 7.4 O teste da Saturno foi atualizado, deliberadamente

`tests/unit/saturno-remaster.test.ts` fixava a aparência inteira da
Maze por `toEqual`, com a justificativa de que ela **ainda não tinha
sido remasterizada**. Depois deste marco essa justificativa deixou de
valer, e manter os valores antigos ali travaria a Maze no estado
anterior a partir do arquivo de outra deusa.

O teste não foi afrouxado: ele agora afirma o estado **novo e
canônico** dela, com o mesmo `toEqual`, e continua guardando o que
sempre guardou — que o marco da Saturno não encosta na Maze. Qualquer
mudança futura volta a quebrá-lo, como deve.

`tests/unit/saturno-remaster.test.ts` — **28 casos, 28 passam.**

### 7.5 Suíte geral

**1 277 passam · 11 pulados · falhas listadas abaixo.**

Quatro testes falham nesta sandbox. **Os quatro falham também em
`9fbc13e`, sem nenhuma alteração da Maze** — verificado com
`git stash`:

| teste | natureza |
| --- | --- |
| `coracao-roseiral` › nenhum habitante nasce dentro | preexistente |
| `npc-system` › teto de moradores visíveis | preexistente |
| `npc-afters` › mesma silhueta ao reaparecer | **timeout de 5 s** — 5 636 ms na base contra 5 714 ms aqui; lentidão da máquina, não regressão |
| `universo-persistencia` › começar e chegar | só sob carga paralela; **passa isolado** |

### 7.6 Comparação de hashes de todos os avatares, em todos os LODs

Feita com `tools/assinaturas.ts` contra um worktree em `9fbc13e`. A
assinatura cobre **todos os atributos** de geometria — posição, cor,
acabamento, normal, pesos de esqueleto e índices — nas **três malhas**
do avatar, para o Panteão inteiro e para o catálogo inteiro de
penteados, trajes e acessórios, nos quatro níveis de detalhe.

| | |
| --- | --- |
| assinaturas na base | 240 |
| assinaturas agora | 248 |
| **idênticas** | **236** |
| **divergentes** | **4 — e todas são `panteao/maze`** |
| **novas** | **8 — `cabelo/copa` e `traje/jardim`, 4 LODs cada** |
| **perdidas** | **0** |

Nenhum outro personagem, penteado, traje ou acessório mudou um único
vértice. O Aérion, a Amara e a Júpiter — os três que dependiam das
peças que a Maze largou — saíram bit a bit idênticos.

#### A malha `rosto` da Maze também mudou, e é esperado

As quatro linhas divergentes incluem o hash do rosto. Investigado:

```
rosto: vertices movidos = 0 | vertices repintados pela troca de hairColor = 1200 de 4452
```

**Nenhum vértice se moveu.** Os 1 200 repintados são sobrancelhas e
cílios, que seguem a cor do cabelo por construção. Sobrancelhas verdes
num cabelo castanho é que seriam o defeito.

### 7.7 Capturas

Bancada com WebGL 2.0 real (ANGLE/Vulkan/SwiftShader), **sem nenhum
erro de console** em todas as capturas.

| cena | antes | depois |
| --- | --- | --- |
| corpo inteiro, dia | `/tmp/cap/m0-corpo.png` | `/tmp/cap/m21-corpo.png` |
| rosto em close | `/tmp/cap/m0-rosto.png` | `/tmp/cap/m20-rosto.png` |
| costas | — | `/tmp/cap/m21-costas.png` |
| **noite (22h)** | — | `/tmp/cap/m21-noite.png` |
| **LOD baixo** | — | `/tmp/cap/m21-baixa.png` |

À noite as nervuras e os brotos `Finish.Holo` acendem sozinhos — a
bioluminescência vem de seiva, não de circuito. No LOD baixo a
silhueta da juba e a faixa diagonal do peito sobrevivem, e todo o resto
corta.

---

## 8. Limitações conhecidas, declaradas

1. **A aresta onde a franja encontra a testa ainda é perceptível em
   close extremo.** Foi atacada com pontas de cacho pousadas sobre a
   testa, que a quebram em boa parte da largura, mas não a eliminam.
   É a interseção de duas superfícies suaves, e resolvê-la de verdade
   pediria abrir a malha do cabelo — fora do escopo deste marco.
2. **O drapeado de pano foi abandonado** (secção 6.1). A folhagem em
   cascata é uma solução de substituição, não a reprodução literal do
   véu da arte.
3. **O custo em `alta` e `ultra` subiu** (secção 5). Sem teto
   normativo, mas registrado para o próximo marco.
4. **Defeito preexistente não mascarado:** `buildSkirt` marca parte da
   perna nua com o acabamento de tecido. Acontece igual no `jardim` e
   no `vestido` — não é peça da Maze, e consertar exigiria mexer em
   construção compartilhada. Fica medido por teste para não ser
   esquecido.

---

## 9. Arquivos modificados

| arquivo | o que mudou |
| --- | --- |
| `src/player/AvatarAppearance.ts` | catálogos `copa` e `jardim`, fora do sorteio de habitantes |
| `src/player/body/BodyBuilder.ts` | `case 'copa'` e `buildGardenSuit` |
| `src/characters/Pantheon.ts` | ficha e bio da Maze |
| `tests/unit/maze-remaster.test.ts` | **novo** — 39 casos |
| `tests/unit/saturno-remaster.test.ts` | asserções da Maze atualizadas (secção 7.4) |
| `lab.html` | Maze selecionável na bancada |
| `docs/PLANO-MAZE-2.0.md` | plano aprovado antes da implementação |
| `docs/VALIDACAO-MAZE-2.0.md` | este relatório |

Nenhum sistema global foi tocado. Nenhuma peça compartilhada foi
alterada.
