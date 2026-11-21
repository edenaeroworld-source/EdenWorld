# Validação — Amara 2.0

A Amara é a **décima e última** figura do Panteão a receber peças
próprias, e a única com um sistema exclusivo no motor: o ventre de
`src/player/Gestation.ts`, que ela carrega pela cidade inteira. Este
documento registra o que foi construído, o que foi medido e o que a
bancada derrubou pelo caminho.

O plano do marco está em [`PLANO-AMARA-2.0.md`](PLANO-AMARA-2.0.md),
escrito e aprovado **antes** de qualquer geometria.

---

## 1. O que ela era

| campo | antes | depois |
| --- | --- | --- |
| `hairStyle` | `longo` (de habitante, e do Criador) | **`nascente`** (exclusivo) |
| `outfit` | `aero` (de habitante, e do Criador) | **`regaco`** (exclusivo) |
| `accessory` | `nenhum` | **`nimbo`** (exclusivo) |
| `hairColor` | `#2b1d16` | `#e3f6ec` |
| `topColor` | `#f3ead6` | `#8fe3cd` |
| `bottomColor` | `#c79a3a` | `#2f9b8e` |
| `colors` | `#ffe9a6`, `#c79a3a` | **`#aef0dd`, `#2f9b8e`** |
| `aura` | `0xffe9a6` | `0x9fe8d8` |
| `halo` | *(não declarado)* | **`0xbdf6e8`** |

Tudo o mais saiu intacto: `title`, `domain`, `tagline`, `bio`, `place`
(Mirante Celeste), `gestation: 1`, `height`, e — de propósito — a
**pele `#7d4a2c`** e o **olho âmbar `#c98a2b`**. O âmbar é o único
ponto quente de um visual que sem ele vira monocromático.

### O achado que abriu o marco

Ela vestia as duas peças genéricas ao mesmo tempo. Resultado: a Deusa
da Maternidade e o **Criador do Éden Aero** saíam da mesma malha,
triângulo por triângulo, nos quatro níveis de detalhe — diferiam
apenas na semente do rosto. `longo` e `aero` não foram tocados: são
dele e de meia cidade. Quem saiu deles foi ela.

---

## 2. As três peças

### `nascente` — o penteado

Água que brota: raiz verde-água (`NASCENTE_RAIZ 0x7fcfb8`) que clareia
até a ponta, a queda mais longa do catálogo, domo com volume próprio
sobre a calota e franja recortada. Duas mechas frontais caem sobre o
peito, por fora da orelha.

### `regaco` — o traje (Manto Regaço)

Um manto em **U** que abraça o busto e desce à frente do ventre até
fechar sobre a saia; gola alta de vidro com fio aceso; cinco gotas de
colar; e **nervuras de luz descendo pela saia** — vida que segue
adiante, dita como ritmo, sem nenhum símbolo literal. Foi o que o
Criador pediu ao escolher o manto.

### `nimbo` — o acessório (Nimbo Materno)

Arco vertical de luz atrás da cabeça, com um segundo fio interno e
sete contas nos níveis altos. O nome óbvio — "auréola" — já era de
habitante, e tomá-lo renomearia um acessório que meia cidade usa.

---

## 3. A fronteira cromática

O dourado antigo dela (`#ffe9a6` / `#c79a3a`) era vizinho direto do da
Saturno (`#ffd98a` / `#e08a2f`), com a Júpiter encostando no mesmo
canto quente. A água-marinha nova entra entre os verdes do elenco pelo
**matiz** e pelo **valor**:

| personagem | matiz primária | matiz secundária |
| --- | --- | --- |
| maze | 134° | 148° |
| suki | 142° | 152° |
| **amara** | **163°** | **173°** |
| lilly | 168° (néon) | 88° |
| haru | 193° | 209° |

Vocabulário alheio, respeitado: **vegetação é da Maze**, **anel
orbital inclinado é da Nexara**, **ouro em massa é da Saturno**,
**vidro líquido em peça inteira é da Luma**.

---

## 4. A bancada — quinze rodadas

Nenhuma destas conclusões veio de leitura de código: todas vieram de
captura renderizada.

| # | o que a captura mostrou | a causa, medida |
| --- | --- | --- |
| 1 | tudo branco; o manto lê como **suspensório** | fita de 3,4 cm sobre pano claro |
| 2 | **touca de natação** no alto da cabeça | relevo rejeitado pela cerca `longeDaCabeca` |
| 3 | a touca sobrevive | só **2 de 13 anéis** caíam acima de `cy`: o domo não tinha vértices para empurrar |
| 4 | **elmo** de frente, **casulo** de costas | mechas nascendo *dentro* da orelha; cabelo e vestido na mesma cor |
| 5–8 | capuz persistente; manto **facetado** | ver abaixo — o erro de origem |
| 9 | **chapéu de chef** teal sobre a cabeça | o domo subiu até `y = 1,06` |
| 10–12 | massa pálida contínua, ainda lisa | faltavam vales em meridiano |
| 13–14 | **aba** atravessada na testa | rampa frontal curta: salto de 13 cm em 4 cm de altura |
| 15 | **casulo** de costas, de novo | a queda media `1,40 R` — mais larga que os ombros |

### O erro de origem

`cy`, o centro da cabeça em `buildHair`, **não é o centro do crânio**.
Vale `headJointY + 0,16 · headSize` = **0,716**, que neste corpo é a
altura da boca. Medido na malha:

```
orelha        cy + 0,27 R      (y = 0,682)
alto do crânio cy + 1,25 R     (y = 0,929)
```

Durante quatro rodadas o domo foi desenhado com `topY = cy + 1,08 R`
— isto é, **meio crânio abaixo do alto da cabeça**. Tudo o que
aparecia no topo era a calota lisa que `buildHair` desenha para os
dezesseis penteados, e nenhuma quantidade de volume adicionado abaixo
dela ia mudar isso. O domo atual é uma **elipse ajustada à pele
varrida**:

```
pele nua:  y 0,80 → 0,1654   y 0,88 → 0,0986
           y 0,84 → 0,1446   y 0,92 → 0,0493   topo 0,929
domo:      centro cy + 0,42 R · meia-altura 0,92 R · meia-largura 1,15 R
           topo em 0,945 — um centímetro e meio acima do crânio
```

### As outras três causas

- **A saia, não a pelve.** O fecho do manto foi desenhado contra
  `PELVIS_PROFILE` (raio 0,13–0,17) e nasceu **dentro do pano**: a
  saia vestida mede 0,2345 na mesma altura. É o erro das folhas da
  Saturno, repetido.
- **A elipse de 2,3 : 1.** A 60° de azimute o tronco tem `z = 0,061`
  — o manto passava **ao lado** do corpo, e o ventre (que avança até
  `z = 0,19`) o engolia. A 44° o ponto fica em `z = 0,098`, que depois
  do morph vai a 0,201, à frente do ventre.
- **`Finish.Glass` em peça varrida.** Cada quadro devolvia o sol num
  ângulo diferente e o manto saía facetado, lido como placa de vidro.
  É `Finish.Cloth`; o brilho vem do fio `Holo` na borda, que acende em
  vez de espelhar.

---

## 5. Orçamento

Medido com as três malhas somadas (corpo + rosto + halo):

| LOD | antes (= Aérion) | depois | teto declarado | folga |
| --- | --- | --- | --- | --- |
| baixa | 8 220 | **8 378** | 8 900 | 522 |
| média | 12 948 | **14 592** | 15 800 | 1 208 |
| alta | 20 330 | **24 890** | 26 000 | 1 110 |
| ultra | 66 224 | **78 320** | 79 000 | 680 |

A primeira medição em ultra deu **85 592** — 6 592 acima do teto. Três
cortes, nenhum visível em captura:

| corte | economia |
| --- | --- |
| anéis de controle da queda 15 → 11 | ~2 500 |
| subdivisão da queda `detail.steps` (7) → 4 | ~2 600 |
| subdivisão da gola 7 → 3 | ~1 100 |
| passos da faixa `segments · 1,5` → `· 0,8` | ~700 |

Ela continua **mais barata que a Maze** (81 620 em ultra), que é o
teto do elenco.

---

## 6. Validação

### Assinaturas

`tools/assinaturas.ts`, comparado contra o baseline tirado em
`f38a2ec` antes da primeira linha do marco:

- **uma única entrada divergiu**: `panteao/amara` (corpo nos quatro
  níveis, e `rosto`, porque a sobrancelha herda `hairColor`);
- **doze entradas novas**: `cabelo/nascente`, `traje/regaco`,
  `acessorio/nimbo`, quatro LODs cada;
- **nenhuma entrada perdida**. `panteao/aerion`, `cabelo/longo` e
  `traje/aero` saíram com os mesmos números do baseline.

### Testes

`tests/unit/amara-remaster.test.ts` — **46 casos**, todos passando.

Seis travas de marcos anteriores precisaram de atualização, cada uma
com a nota do porquê no próprio arquivo:

| arquivo | o que dizia | o que diz agora |
| --- | --- | --- |
| `jupiter-remaster.test.ts:511` | `amara.colors` é o dourado | é a água-marinha; a asserção que importa (nenhuma das três partilha ponta de paleta) continua |
| `jupiter-remaster.test.ts:556` | Aérion **e Amara** usam `longo` | a testemunha do `longo` é o Aérion |
| `maze-remaster.test.ts:140` | idem | idem |
| `maze-remaster.test.ts:575` | idem | idem |
| `haru-remaster.test.ts:259` | Aérion e Amara saem de `aero` com malhas idênticas | compara o dono da peça contra um habitante que a veste |
| `nexara-remaster.test.ts:193` | `Finish.Holo` é "da Nexara e de mais ninguém" | só brilha quem tem briefing; e a Amara, trocadas as três peças pelas genéricas, **volta a zero** |

### A falha preexistente

`tests/unit/coracao-roseiral.test.ts` falha no baseline `f38a2ec` e
continua falhando — é anterior a este marco e está fora de escopo.
`tests/unit/universo-persistencia.test.ts` passa isolado (29/29) e
oscila sob carga paralela; não tem relação com o marco.

---

## 7. O ventre, que é o sistema dela

Nada do que ela veste pode ignorar a gestação. A banda multiplica `x`
e `z` por até **2,05** em `y = 0,16`, e o deslocamento é
**multiplicativo** — camada com folga constante mantém a folga, desde
que declare `zone` e `origin`.

Provado na bateria com a implementação de referência do morph
(`displaceGestation`, a mesma conta do GLSL): na faixa do ventre, a
roupa a `z = 0,184` em repouso vai a **`z = 0,327`** em gestação
plena. Ela acompanha a barriga em vez de rachar nela.

Regra de ouro do marco, medida antes de qualquer peça: **rígido só
acima de `y = 0,36` ou abaixo de `y = −0,04`.** A gola, o colar e o
nimbo estão todos acima; as nervuras da saia, todas abaixo.
