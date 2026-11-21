# Maze 2.0 — Remasterização Oficial · plano técnico

**Branch:** `arena/3bed3c4f-edenworld` (a partir de `9fbc13e`, a `main` depois do marco da Haru)
**Personagem:** Maze — Deusa da Natureza, do Parque das Águas
**Estado:** plano escrito **antes** de qualquer geometria, como manda o briefing.

---

## 1. O que a investigação encontrou

### 1.1 A ficha de hoje

```ts
look('#7d4a2c', 'longo', '#3fcf86', '#2f9a66', 'vestido',
     '#a8f0c0', '#1fae6b', '#f3ead6', 'flor', 1.03)
```

| campo | valor | quem mais usa |
|---|---|---|
| `skin` | `#7d4a2c` | — |
| `hairStyle` | **`longo`** | **Aérion (o Criador), Amara**, habitantes |
| `hairColor` | `#3fcf86` (verde) | — |
| `eyeColor` | `#2f9a66` | — |
| `outfit` | **`vestido`** | **Júpiter**, habitantes |
| `topColor` · `bottomColor` | `#a8f0c0` · `#1fae6b` | — |
| `accessory` | **`flor`** | habitantes |
| `height` | `1.03` | — |

**Os três campos de aparência dela são compartilhados — de novo.** É o
mesmo quadro da Haru, com dois agravantes próprios:

- **`longo` veste o Aérion, o Criador do Éden Aero, e a Amara.**
  Remasterizar o penteado onde ele mora repintaria os dois;
- **`vestido` veste a Júpiter, que ainda não teve o marco dela.**
  Mexer no `vestido` gastaria o marco da Júpiter antes da vez dela —
  exatamente o erro que o marco da Saturno evitou ao não tomar a
  `flor` da Maze.

### 1.2 A `flor` custa 912 triângulos e nunca corta

Medido, peça a peça:

| peça | baixa | média | alta | ultra |
|---|---|---|---|---|
| **`flor`** | **912** | **912** | **912** | **912** |
| `longo` | 380 | 728 | 1 320 | 4 752 |
| `vestido` *(vs. `casual`)* | 184 | 476 | 1 040 | 4 664 |

A `flor` é o mesmo defeito que afundou a Saturno e que a Haru tinha
nos `oculos`: **número idêntico nos quatro níveis**. São 13% do
orçamento do LOD baixo gastos numa florzinha rosa de um centímetro na
têmpora, que a cinquenta metros não chega a um pixel — e que nem
combina com a paleta verde dela.

### 1.3 Ela está a 121 triângulos do teto

| avatar | LOD baixo |
|---|---|
| haru | 5 960 |
| padrão | 6 118 |
| saturno | 6 244 |
| aerion · amara | 6 288 |
| nexara | 6 420 |
| suki | 6 592 |
| akemi | 6 648 |
| lilly | 6 768 |
| jupiter | 6 902 |
| **maze** | **7 024** |
| luma | 7 028 |
| **teto** | **7 145,6** |

Segunda mais pesada do elenco, com **121 de folga**. Não há espaço
para folhagem nenhuma sem primeiro resolver a `flor`.

### 1.4 O modelo não entrega quase nada do que a personagem é

A bio dela não descreve aparência — não há promessa escrita a cumprir,
como havia na Haru. Mas o briefing pede natureza viva, e o que existe
hoje é: cabelo verde chapado que lê como touca de natação, vestido
verde-menta liso em duas camadas com anéis horizontais visíveis, e uma
flor **rosa** na têmpora. Nenhuma folha, nenhuma flor no corpo, nenhum
vidro, nenhuma água, nenhuma luz.

---

## 2. As decisões do Criador

Perguntadas antes de uma linha ser escrita, por `ask_user`:

| pergunta | resposta |
|---|---|
| cabelo: ficha (verde liso) ou arte (cacheado volumoso castanho)? | **a arte** |
| a `flor`, que custa 912 e nunca corta | **trocar** por coroa própria dentro do penteado |
| marcas bioluminescentes no rosto, como na arte | **não** — rosto limpo |
| traje: ficha (verdes) ou arte (branco translúcido + folhagem verde)? | **a arte** |

Duas consequências que decorrem disso e ficam registradas:

- **`hairColor` muda de `#3fcf86` para um castanho/bronze.** O verde
  da ficha não desaparece: vira a cor das folhas e dos brotos que
  moram dentro da juba, e a paleta canônica `['#9df0b0','#1fae6b']`
  fica intacta;
- **o teste do marco da Saturno terá de ser atualizado.** Ele afirma
  `maze.appearance.accessory === 'flor'` e compara a ficha inteira com
  `toEqual`. Aquele caso existia para **guardar a Maze até a vez dela
  chegar**; a vez chegou. A atualização é parte do marco, é
  deliberada, e vai documentada — não é teste ajustado para passar.

---

## 3. Território: a Saturno de um lado, a Júpiter do outro

A Maze é a terceira deusa do elenco a encostar em natureza, e as
fronteiras já foram escritas por marcos anteriores.

### 3.1 Contra a Saturno (marco fechado)

O relatório da Saturno registrou a divisão, e ele mesmo prometeu esta
vez:

> O eixo da Saturno é **ANIMAL** — galhada, pata, ouro — e o verde
> entra só como **vidro**, material, nunca como o pano da peça. **A
> Maze terá vegetação de tecido quando chegar a vez dela.**

|  | Saturno | Maze |
|---|---|---|
| eixo | **animal** | **vegetal** |
| folha | **vidro** (`Finish.Glass`), ornamento | **matéria viva** (`Finish.Cloth`), a peça em si |
| silhueta | galhada acima da cabeça | juba larga, copa de árvore |
| metal | ouro | **nenhum** |
| luz | não emite | **bioluminescência** (`Finish.Holo`) |

**Regra deste marco:** a Maze **não usa galhada, não usa ouro e não
usa folha de vidro**. A folha dela é pano; o que acende é a nervura.
É assim que as duas não viram a mesma deusa de longe.

### 3.2 Contra a Júpiter (marco ainda por vir)

A Júpiter usa `cacheado` e `vestido`, e é a **Deusa da Arte**. A Maze
larga o `vestido` neste marco, o que **devolve** a peça inteira à
Júpiter. O `cacheado` nunca foi da Maze e continua não sendo: o
penteado novo é exclusivo e não toca naquele `case`.

---

## 4. O desenho

### 4.1 `copa` — o penteado

O nome é a copa de uma árvore, que é o que a arte mostra: volume
enorme, luz filtrando por dentro, vida morando lá.

- **base cacheada volumosa** em castanho/bronze, bem mais larga que o
  crânio, com silhueta irregular — cacho não tem contorno liso;
- **folhas de pano** assentadas na superfície da juba, em dois verdes
  da paleta canônica, assentadas na curvatura real da casca (a lição
  da franja da Haru: peça que mede o crânio em vez da casca do cabelo
  nasce enterrada);
- **a coroa**, que substitui a `flor`: um arco de folhas e três
  florzinhas na linha da testa, em volta da cabeça — não uma flor
  solta de um lado só;
- **brotos acesos** (`Finish.Holo`), pequenos, distribuídos sem
  simetria, que é o que faz a juba parecer viva à noite;
- **mechas verdes vivas** entre os cachos, que é onde o `#3fcf86` da
  ficha antiga vai morar.

### 4.2 `jardim` — o traje

Drapeado **branco translúcido** com folhagem verde correndo por cima,
como na arte.

- **corpete e saia em branco quente**, com a saia mantendo a silhueta
  que `buildSkirt` já dá (medida: raio 0,3497, barra em y −0,36);
- **faixa de folhagem** cruzando o tronco na diagonal — assimétrica de
  propósito: par simétrico no meio do peito lê como rosto, e isso
  custou uma rodada inteira no marco da Haru;
- **nervuras acesas** (`Finish.Holo`) correndo pela faixa, finas;
- **vinhas na barra da saia**, por **fora** do pano. A cota sai da
  medição (0,3497), não do perfil de controle de `buildSkirt` — no
  marco da Saturno o perfil dizia 0,193 e a saia real media 0,41, e
  todas as folhas nasceram enterradas;
- **gotas de água cristalina** (`Finish.Glass`) na barra e nos ombros,
  poucas e pequenas: é o único vidro do traje, e é água, não folha.

### 4.3 Frutiger Aero sem virar personagem tecnológica

O briefing pede o acabamento e avisa contra o excesso. A linha que
este marco segue: **o brilho vem da água e da seiva, nunca de
circuito**. Sem traço reto, sem placa, sem HUD, sem anel orbital —
isso é vocabulário da Haru e da Nexara. O que a Maze toma emprestado
do Frutiger Aero é o **material**: translucidez, gota, verde saturado
e luz interna.

---

## 5. Plano de LOD

A conta só fecha porque tudo o que é novo corta por distância, e é o
oposto do que a `flor` fazia.

| nível | segmentos | o que existe |
|---|---|---|
| **baixa** | 10 | juba, traje branco, faixa de folhagem (silhueta pura) |
| **média** | 14 | + coroa, folhas grandes, vinhas da barra |
| **alta** | 20 | + brotos acesos, nervuras, gotas de água |
| **ultra** | 44 | tudo, em resolução cheia |

**Meta:** LOD baixo **abaixo de 6 800** — folga de ~345 contra o teto,
contra os 121 de hoje. Ponto de partida sem a `flor`: 6 112.

**Draw calls:** 3 malhas, como todo o elenco. Nenhuma peça nova paga
chamada própria; tudo é mesclado no corpo pelo `SurfaceBuilder`.

---

## 6. O que não se toca

| componente | por quê |
|---|---|
| `longo` | é o penteado do **Criador Aérion** e da Amara |
| `vestido` | é o traje da **Júpiter**, de marco ainda por vir |
| `flor`, `oculos`, `fones`, `chapeu`, `cristal`, `aureola` | acessórios herdados por habitantes sorteados |
| `cacheado` | penteado da Júpiter |
| `silvestre`, `guardia`, `buildAntlers` | marco fechado da Saturno |
| `fibra`, `sistema`, `buildHaruGear` | marco fechado da Haru |
| `buildOrbitRings` | assinatura da Nexara |
| `subdivideProfile`, `feature()`, `SurfaceBuilder`, rig, shaders | sistemas globais; o briefing proíbe mexer neles para resolver problema de uma personagem |
| `buildSkirt`, `buildVNeck`, `buildArm`, `buildLeg` | construção compartilhada por todo o elenco |

Armadilhas já pagas em marcos anteriores, que valem aqui:

- **`Finish.Glass` no traje inteiro não funciona** — `subdivideProfile`
  descarta o acabamento e a perna nua vira vidro. Vidro só peça a
  peça;
- **`feature()` precisa de guarda de distância ao crânio** — senão
  esculpe o osso, como aconteceu na Akemi;
- **`LoftOptions` não aceita `transform`** — deslocamento lateral vai
  no campo `x` de cada estação;
- **peça no meio do peito lê como rosto** se for simétrica;
- **relevo de `feature()` não sobrevive à escala de jogo** — o que
  precisa aparecer tem de ser geometria.

---

## 7. Testes previstos

Arquivo novo `tests/unit/maze-remaster.test.ts`, no formato dos
marcos anteriores. Cerca de **30 casos**:

| grupo | o que prova |
|---|---|
| exclusividade | `copa` e `jardim` nos catálogos, fora do sorteio de habitantes, 2 000 sorteios, saneamento |
| a ficha | penteado/traje/acessório, `hairColor` novo, identidade canônica (aura, `colors`, título, domínio, altura, `place`) |
| território | ficha da **Júpiter** intacta, `vestido` e `cacheado` intactos, `longo` do **Criador** intacto, a `flor` devolvida aos habitantes, Saturno intacta, **sem galhada e sem ouro** |
| orçamento | teto do LOD baixo, 3 malhas, custo monotônico, coroa/folhas/gotas que cortam |
| o cabelo | volume maior que o crânio, folhas assentadas na casca e não enterradas, coroa em volta e não de um lado, crânio não deformado |
| o traje | folhagem assimétrica, vinhas **por fora** do raio medido da saia, água só como vidro, pernas não viram vidro |
| defeito preexistente | o `subdivideProfile` que marca pele nua como pano, já documentado no marco da Saturno |

---

## 8. Validação

1. `npx tsc --noEmit`
2. `npx vitest run tests/unit/maze-remaster.test.ts`
3. suíte completa, com as falhas preexistentes medidas contra a base
4. `npm run build`
5. **`tools/assinaturas.ts`** contra um worktree em `9fbc13e`: 240
   chaves cobrindo o catálogo inteiro, todos os atributos de
   geometria e as três malhas. Esperado: **só `panteao/maze` diverge**,
   mais as chaves novas `cabelo/copa` e `traje/jardim`
6. capturas de bancada: antes/depois, corpo, rosto, costas, perfil,
   andando, **noite** (onde a bioluminescência se paga), LOD baixo e
   elenco de habitantes
7. `docs/VALIDACAO-MAZE-2.0.md` e PR exclusivo, deixado **aberto**
   para autorização do Criador

---

## 9. Riscos

| risco | mitigação |
|---|---|
| a juba volumosa atravessar os braços | medir `maxX` do cabelo contra o ombro (`0,20`), como no marco da Haru |
| folhas enterradas na saia ou na juba | assentar na **superfície medida**, nunca no perfil de controle |
| a Maze virar "Saturno verde" | sem galhada, sem ouro, sem folha de vidro; folha é pano |
| a Maze virar personagem tecnológica | sem traço reto, sem placa, sem HUD; a luz é seiva e água |
| estourar o teto do LOD baixo | a `flor` libera 912; tudo o que é novo corta |
| quebrar o teste do marco da Saturno | atualização deliberada e documentada, não silenciosa |
