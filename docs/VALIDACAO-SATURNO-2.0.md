# Saturno 2.0 — Remasterização Oficial · relatório de validação

**Branch:** `arena/6e42e2bf-edenworld` (a partir de `d258cf3`, a `main` depois do marco da Akemi)
**PR:** Saturno 2.0 — Remasterização Oficial
**Personagem:** Saturno — Defensora dos Animais, primeira filha de Adão e Eva

---

## 1. O que a investigação encontrou antes de uma linha ser escrita

O briefing pedia natureza, Jardim do Éden, folhas e flores. A ficha
da personagem e o resto do elenco disseram outra coisa, e os dois
achados abaixo mudaram o desenho inteiro.

### 1.1 A Maze já é a "Deusa da Natureza"

|  | Saturno | Maze |
|---|---|---|
| título | **Defensora dos Animais** | **Deusa da Natureza** |
| domínio | animais, bem-estar, cultura pet | vegetação, ecossistemas, botânica |
| paleta | `#ffd98a` · `#e08a2f` | `#9df0b0` · `#1fae6b` |
| aparência | `cacheado` · `casual` · **`flor`** | `longo` · `vestido` · **`flor`** |
| remasterizada | **este marco** | **ainda não** |

As duas usavam o mesmo acessório, e a Maze mora no Parque das Águas.
Uma Saturno coberta de folhagem verde teria tomado o território da
Maze antes de a Maze ter vez — e o briefing pede justamente
identidade distinta das outras deusas.

**A divisão adotada:** o eixo da Saturno é **ANIMAL** (galhada, pata,
ouro); o da Maze continua **VEGETAL**. O verde entra na Saturno só
como **vidro** — material translúcido e luminoso — nunca como o pano
da peça. A Maze terá vegetação de tecido quando chegar a vez dela.

### 1.2 A Saturno já estourava o orçamento

Antes de qualquer linha nova, medido em `d258cf3`:

| avatar | LOD baixo | situação |
|---|---|---|
| **saturno** | **7 630** | **estourada em 484** |
| luma | 7 028 | ok |
| maze | 7 024 | ok |
| jupiter | 6 902 | ok |
| lilly | 6 768 | ok |
| akemi | 6 648 | ok |
| haru | 6 642 | ok |
| suki | 6 592 | ok |
| nexara | 6 420 | ok |
| padrão | 6 118 | ok |

Teto: **7 145,6**. A culpa era de duas peças compartilhadas que nunca
cortaram por distância: o acessório `flor` (**912** triângulos) e o
penteado `cacheado` (**1 170**). A três metros nenhuma das duas chega
a um pixel, e mesmo assim as duas eram construídas inteiras.

Trocar as duas por peças próprias que **cortam por LOD** é o que
pagou o marco inteiro.

---

## 2. Decisões do Criador

Perguntado antes da implementação, respondeu:

1. **Dourado e verde em pé de igualdade** — folhagem verde translúcida
   sobre base dourada;
2. **a ficha pode ser ajustada** se o visual pedir;
3. **galhada em vidro E emblema de pata EdenPawl** — os dois.

Os três foram atendidos. O item 2 foi usado uma vez só, e está
registrado na secção 4.

---

## 3. Arquivos modificados

| arquivo | o que mudou |
|---|---|
| `src/player/body/BodyBuilder.ts` | `+365` — o penteado `silvestre`, `buildAntlers()`, o traje `guardia`, `buildGuardiaSuit()` e as flags do traje |
| `src/characters/Pantheon.ts` | `+10 −2` — a ficha da Saturno |
| `src/player/AvatarAppearance.ts` | `+10 −2` — `silvestre` e `guardia` nos catálogos, **fora** das listas de habitante |
| `lab.html` | `+1` — Saturno no seletor da bancada |
| `tests/unit/saturno-remaster.test.ts` | novo — 27 casos |
| `docs/validacao/saturno/` | novo — 11 capturas |
| `docs/PLANO-SATURNO-2.0.md` | o plano aprovado antes da implementação |

Nenhum sistema global foi tocado. `subdivideProfile`, `feature()`,
`buildSkirt`, `SurfaceBuilder`, o rig e os shaders saem do marco
intactos.

---

## 4. A ficha, antes e depois

```
antes   look('#a96c45', 'cacheado', '#8a5a2b', '#c98a2b', 'casual',  '#ffd84a', '#7ddc5a', '#f3ead6', 'flor',   1.0)
depois  look('#a96c45', 'silvestre','#8a5a2b', '#c98a2b', 'guardia', '#ffd84a', '#d99a30', '#f3ead6', 'nenhum', 1.0)
```

**Três dos quatro campos trocados eram compartilhados:**

- `cacheado` → `silvestre`: `cacheado` é penteado de habitante **e** é
  o da Júpiter;
- `casual` → `guardia`: `casual` é traje de habitante;
- `flor` → `nenhum`: `flor` é acessório de habitante **e** é o da
  Maze. A galhada nasce dentro do penteado justamente para não gastar
  o campo `accessory`, que é um só.

O quarto é o uso da autorização para ajustar a ficha:
`bottomColor` **`#7ddc5a` → `#d99a30`**. O verde-limão pintava a saia
inteira e a figura saía como uma deusa-da-vegetação genérica — o que
o briefing proíbe e o que atropelava a Maze. O ouro virou o pano; o
verde virou o vidro.

**Preservado:** aura `0xffd98a`, paleta `['#ffd98a','#e08a2f']`, pele,
cor do cabelo, cor dos olhos, altura, título, domínio, bio, contato e
o lugar dela em frente à Casa EdenPawl.

---

## 5. As peças novas

### `silvestre` — o penteado

Queda longa e pesada, do couro cabeludo ao meio das costas (desce até
`y = 0,159`, com o ombro em `0,370`). Mais longa que a da Akemi, que
para no ombro; mais curta que a `cascata` da Suki, que vai à junta do
quadril. Degradê castanho na raiz → dourado na ponta, no mesmo ouro da
aura dela. As tranças de vinha são **relevo** (`feature()`), que custa
zero triângulo.

### A galhada — a assinatura

Em `Finish.Glass` dourado, nascendo **dentro** do penteado. É
inequivocamente animal, vem do cervo, e nenhuma outra figura do
Panteão tem nada parecido. Sobe até `y = 1,207`, contra um topo de
cabelo em `0,929`: é silhueta de verdade, não detalhe interno.

### `guardia` — o traje

Túnica dourada **de pano**, faixa de cintura com fivela, saia longa
(`GOWN_HEM_Y`), **braços nus** — ela é a única deusa que trabalha com
as mãos. Por cima: uma **gola de folhas de vidro** em anel completo na
linha do pescoço e uma **barra de folhas pontudas** em duas fileiras
sobrepostas no terço de baixo da saia.

### O emblema de pata da Casa EdenPawl

Almofada e quatro dedos em `Finish.Holo`, no peito, a `z = 0,134`. É o
que diz "animais" sem depender de folha nenhuma, e é a única peça que
sobrevive a **todos** os níveis de LOD.

### A paleta

| | cor | onde |
|---|---|---|
| ouro | `#e0a83a` | túnica, faixa, presilhas |
| ouro claro | `#ffd84a` | fivela, luz |
| ouro da saia | `#d99a30` | saia |
| folha | `#a8e86a` | vidro verde-amarelado, ponte com o ouro |
| folha funda | `#5fcf9b` | vidro verde-azulado, o **aqua** do briefing |
| galhada | `#ffd98a` | vidro, a cor da aura dela |
| creme | `#fff4dc` | o emblema de pata, em `Holo` |

Os dois verdes fogem de propósito do `#9df0b0`/`#1fae6b` da Maze.

---

## 6. Orçamento de geometria

| LOD | antes | depois | variação |
|---|---|---|---|
| **baixa** | **7 630** (estourada) | **6 244** | **−1 386** |
| media | 12 822 | 12 112 | −710 |
| alta | 19 874 | 19 914 | +40 |
| ultra | 63 992 | 68 680 | +4 688 |

A conta fecha porque saem 2 082 triângulos de peças que **não**
cortavam por distância (`flor` 912 + `cacheado` 1 170) e entram peças
que cortam. No LOD baixo o marco inteiro custa **zero**: não há
galhada, nem gola, nem folhas — e é exatamente lá que a personagem
estava estourada.

Todo o vidro desaparece no LOD de longe, medido:

| LOD | vértices em `Glass` | galhada |
|---|---|---|
| baixa | **0** | ausente |
| media | 1 080 | reduzida (288) |
| alta | 1 584 | completa (432) |
| ultra | 1 584 | completa (432) |

### Chamadas de desenho

```
malhas=3  chamadasDaCena=6  triangulos=142360
```

Medido no browser, em WebGL 2.0 real. **Três malhas e seis chamadas**
é o portão herdado dos marcos anteriores, e ele continua de pé: corpo,
rosto e halo. Galhada, gola, pata e folhas são mescladas no corpo —
nenhuma peça nova paga chamada de desenho.

---

## 7. Testes

### `tests/unit/saturno-remaster.test.ts` — **27 passam / 27**

| grupo | casos |
|---|---|
| o que é exclusivo dela | 4 |
| a ficha | 5 |
| orçamento e chamadas de desenho | 4 |
| a galhada | 4 |
| o cabelo | 4 |
| o traje | 5 |
| defeito preexistente | 1 |

Entre eles, os que guardam decisões que custaram caro:

- **nenhum habitante sorteado sai de `silvestre` ou de `guardia`** —
  dois mil sorteios;
- **a Maze e a Júpiter saem do marco intactas** — ficha inteira,
  campo a campo;
- **a paleta dourada dela não encosta na paleta verde da Maze**;
- **a galhada nasce dentro do couro cabeludo**, comparada contra o
  raio real do crânio naquela altura;
- **as folhas da barra ficam por fora da saia** (raio > 0,4118);
- **o emblema de pata fica à frente do peito** (z > 0,113);
- **o relevo das tranças não deforma o crânio** — pior desvio
  **0,695 mm** contra o gabarito `rabo`, teto de 2 mm.

### Suíte completa

```
Test Files  1 failed | 57 passed | 5 skipped (63)
     Tests  1 failed | 1208 passed | 11 skipped (1220)
```

1 181 passavam antes; 1 181 + 27 = **1 208**. Nenhum teste existente
quebrou.

### TypeScript e build

```
npx tsc --noEmit        limpo
npm run build           ✓ built in 572ms
  dist/assets/index-CbAmPfdJ.js   748.00 kB │ gzip: 247.11 kB
  dist/assets/three-BhJBZdXF.js   590.01 kB │ gzip: 146.51 kB
```

Não existe `npm run lint` neste repositório.

---

## 8. Hashes — prova de que o resto do Éden não mudou

Assinatura de `position`, `normal`, `aFinish` e `color` de **cada
personagem do Panteão**, da aparência padrão e de **doze habitantes
sorteados**, nos **quatro LODs** — contra uma árvore limpa em
`d258cf3`:

```
== iguais: 92   diferentes: 4 ==

DIFERE: saturno@baixa
DIFERE: saturno@media
DIFERE: saturno@alta
DIFERE: saturno@ultra
```

**Os quatro que mudaram são exatamente os quatro LODs da Saturno.**
Todos os outros avatares, em todos os níveis, saem byte a byte
idênticos.

---

## 9. Capturas

Em `docs/validacao/saturno/`:

| arquivo | o que mostra |
|---|---|
| `01-antes-corpo.png` | **antes** — dia |
| `02-depois-corpo.png` | **depois** — dia |
| `03-depois-rosto.png` | rosto de perto, com a gola e a galhada |
| `04-depois-costas.png` | a queda do cabelo e o degradê |
| `05-depois-perfil.png` | a galhada de perfil |
| `06-depois-andando.png` | em movimento |
| `07-depois-noite.png` | **depois** — iluminação noturna |
| `08-antes-noite.png` | **antes** — iluminação noturna |
| `09-lods.png` | os quatro níveis lado a lado |
| `10-elenco.png` | o elenco de validação, inalterado |
| `11-panteao.png` | **Saturno ao lado de Maze, Júpiter, Lilly e Akemi** |

O `01-antes-corpo.png` é o argumento do marco inteiro: camiseta
amarela, **calça verde-limão** e uma florzinha — indistinguível de um
habitante qualquer, e no verde da Maze.

O `11-panteao.png` é a prova de território: a Saturno dourada com
galhada, ao lado da Maze verde com flor. Ninguém confunde as duas.

O `09-lods.png` conta a degradação: no nível baixo não há galhada,
nem folhas, nem gola — só a túnica e o emblema de pata.

---

## 10. Problemas encontrados

### 10.1 Falha preexistente na suíte

```
FAIL  tests/unit/coracao-roseiral.test.ts
      > nenhum habitante nasce dentro, nem vai parar lá em dois minutos de parque
Error: Test timed out in 5000ms
```

**Não é deste marco.** Rodada na árvore limpa em `d258cf3`, pelo
`git worktree`, a mesma falha aparece igual (`1 failed | 33 passed`).
É um teste de simulação de dois minutos de parque que não cabe no
timeout de 5 s da configuração.

### 10.2 Pele nua sai marcada como pano — defeito preexistente da engine

`subdivideProfile` descarta o campo `finish` das estações e trava o
anel inteiro num valor só. O resultado é que braço e perna nus
renderizam com o acabamento de pano em todo o Éden. Medido na
panturrilha, vértices em `Cloth`:

| traje | perna |
|---|---|
| `vestido` | 2 024 |
| `praia` | 2 024 |
| `casual` | 2 024 |
| `esportivo` | 2 024 |
| **`guardia`** | **2 024** |

Número idêntico nos cinco: **o defeito é da engine, não do traje.**
Consertar `subdivideProfile` mexeria no corpo de todos os avatares do
jogo e merece PR próprio, com os hashes de todo mundo recalculados —
fora do escopo deste marco. Há um caso de teste que registra o defeito
e que vai **cair** no dia em que alguém o consertar, apontando o lugar.

Pelo mesmo motivo, o teste dos braços nus da Saturno mede **cor**, não
`aFinish`.

### 10.3 Cinco tentativas que a bancada reprovou

Nenhuma delas sobreviveu, e todas estão comentadas no código:

1. **a galhada flutuando acima da cabeça** — posicionada por ângulo e
   comprimento, a base caiu em `x = 0,134` numa altura em que o crânio
   mede `0,105` de raio. Corrigido ligando ponta a ponta: se o
   primeiro ponto está dentro do couro cabeludo, o ramo nasce dentro
   dele;
2. **a galhada fina como capim** — 19 mm na base, sumia de perfil.
   Hoje 32 mm, afinando;
3. **as folhas enterradas dentro da saia** — calculadas pelo perfil de
   controle de `buildSkirt` (`hipWidth · 1,22 = 0,193`) quando a saia
   que sai do forno mede **0,41**. É o mesmo erro do laço da Akemi, e
   o motivo de toda cota de adereço deste marco sair de uma sonda na
   malha, não de uma conta;
4. **o manto de folhas invisível** — primeiro só nas costas, depois
   como ombreira. Só fechou como **gola**, anel completo na linha do
   pescoço, com 60 vértices à frente e 60 atrás;
5. **o poste listrado de carnaval** — lâminas compridas do cós à barra
   leem como fita, não como folha. Trocadas por folhas curtas,
   pontudas e sobrepostas.

---

## 11. Conformidade com o briefing

| exigência | situação |
|---|---|
| investigação antes de implementar | ✅ dois achados que mudaram o desenho |
| plano apresentado antes do código | ✅ `docs/PLANO-SATURNO-2.0.md`, commit `040b93f` |
| não inventar nada contra o cânone | ✅ título, domínio, aura, paleta, bio e lugar preservados |
| conexão com natureza e animais | ✅ galhada, pata EdenPawl, folhas de vidro |
| vidro translúcido e materiais luminosos | ✅ `Glass` na galhada e nas folhas, `Holo` no emblema |
| verdes, aqua, dourados | ✅ ouro no pano, verde-amarelado e verde-azulado no vidro |
| Frutiger Aero no vestuário | ✅ gola e barra de folhas de vidro |
| identidade distinta das outras deusas | ✅ `11-panteao.png`; eixo animal contra o vegetal da Maze |
| branch exclusiva a partir da `main` | ✅ `arena/6e42e2bf-edenworld` de `d258cf3` |
| respeitar LOD | ✅ tudo que é novo corta; o LOD baixo custa zero |
| preservar orçamento e draw calls | ✅ 7 630 → 6 244; `malhas=3 chamadasDaCena=6` |
| compatibilidade WebGL2 | ✅ capturas em WebGL 2.0 real, `ERROS: nenhum` |
| não mexer em sistemas globais | ✅ nenhum |
| preservar os outros avatares | ✅ 92 hashes iguais, 0 diferentes |
| testes específicos | ✅ 27 casos |
| TypeScript, build e suíte | ✅ limpos; 1 208 passam |
| hashes em todos os LODs | ✅ secção 8 |
| capturas diurnas e noturnas | ✅ `01`/`08` antes, `02`/`07` depois |
| documentar falhas preexistentes | ✅ secção 10 |

---

## 12. Autorização

**Este PR não deve ser mesclado sem autorização expressa do Criador.**
A Haru não foi iniciada.
