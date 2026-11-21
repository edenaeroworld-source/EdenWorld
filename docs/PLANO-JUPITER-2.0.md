# Júpiter 2.0 — plano técnico

Marco visual da **Júpiter, Deusa da Arte e da Criação Estética**, dona
do Pavilhão Lumen, a galeria holográfica de Aurora City.

Este documento é escrito **antes de qualquer geometria**, como o
briefing exige. Ele registra o que a investigação mediu, as decisões
que o Criador tomou, o que será construído e como será provado.

---

## 1. O que a investigação encontrou

### 1.1 Ela é a última deusa com as duas peças genéricas

Mapeado o Panteão inteiro contra os catálogos de habitantes:

| deusa | penteado | traje |
| --- | --- | --- |
| Haru | `fibra` | `sistema` |
| Nexara | `fluxo` | `rede` |
| Suki | `cascata` | `docente` |
| Luma | `ondulado` *(compartilhado)* | `aurora` |
| Lilly | `onda` | `sonora` |
| Akemi | `cachos` | `cosplay` |
| Saturno | `silvestre` | `guardia` |
| Maze | `copa` | `jardim` |
| **Júpiter** | **`cacheado`** *(compartilhado)* | **`vestido`** *(compartilhado)* |

As oito remasterizadas têm traje exclusivo. A Júpiter é a **única com
os dois campos visuais emprestados dos habitantes sorteados** — é a
última deusa genérica do elenco.

### 1.2 O `cacheado` é o penteado mais caro do catálogo, e o mais pobre

Medido vs. `careca`, nos quatro níveis:

| penteado | baixa | ultra |
| --- | --- | --- |
| `copa` | 340 | 13 940 |
| `silvestre` | 340 | 4 192 |
| `fibra` | 340 | 6 128 |
| `longo` | 380 | 4 752 |
| `ondulado` | 380 | 7 832 |
| `cachos` | 480 | 7 220 |
| `onda` | 488 | 7 000 |
| `cascata` | 500 | 9 132 |
| `fluxo` | 540 | 9 040 |
| **`cacheado`** | **1 170** | **4 284** |

**Três vezes mais caro que a média a cinquenta metros, e quase o mais
pobre em close.** É o inverso exato do que um nível de detalhe deve
fazer.

A causa está no código: oito a doze esferas com **subdivisão fixa 5**,
que não cai com a distância. É o mesmo defeito estrutural da `flor` da
Maze (912 triângulos iguais nos quatro LODs) e dos `oculos` da Haru
(524 sem cortar).

**O `cacheado` não será corrigido.** É peça de habitante, e o briefing
proíbe mexer em construção compartilhada sem necessidade comprovada. A
Júpiter sai dele; ele fica como está para quem o herda.

### 1.3 Ela tem a segunda pior folga do elenco

| deusa | LOD baixo | folga até 7 145,6 |
| --- | --- | --- |
| Haru | 5 960 | 1 185,6 |
| Maze | 6 012 | 1 133,6 |
| *(corpo padrão)* | 6 118 | — |
| Saturno | 6 244 | 901,6 |
| Nexara | 6 420 | 725,6 |
| Akemi | 6 648 | 497,6 |
| Lilly | 6 768 | 377,6 |
| **Júpiter** | **6 902** | **243,6** |
| Luma | 7 028 | 117,6 |

Custo atual por LOD: **6 902 / 12 386 / 20 002 / 67 744**, em 3 malhas.

### 1.4 O que ela veste hoje não tem nada de arte

Capturado na bancada (`/tmp/cap/j0-corpo.png`, `j0-rosto.png`):

* o cabelo é um **capacete de oito bolas vermelhas**, com a calota
  compartilhada lisa aparecendo por baixo;
* o traje é um **vestido laranja liso**, sem um único detalhe;
* `bottomColor: '#2e3a4f'` — azul-escuro — **não aparece em lugar
  nenhum** da malha;
* nenhum elemento sugere pintura, cor, luz ou criação.

É a maior distância entre ficha e arte de referência de todos os
marcos até aqui.

### 1.5 Medidas da malha (ultra)

| medida | valor |
| --- | --- |
| topo do crânio | 0,9265 |
| orelha | \|x\| 0,1804 em y 0,6820 |
| frente do rosto | z 0,2089 em y 0,6653 |
| cabelo `cacheado` | y 0,6445…0,9288 · maxX 0,2394 |
| **saia `vestido`, barra** | **raio 0,3497 em y −0,36** |
| braços nus (bind pose) | y −0,25…−0,05, \|x\| até 0,212 |

A saia dela usa `SKIRT_HEM_Y` (−0,36), **não** a barra longa
`GOWN_HEM_Y` (−0,46) do Traje Jardim da Maze. O raio é outro, e será
medido de novo nesta malha antes de qualquer peça encostar nela — o
erro de herdar raio de outro marco já custou duas rodadas de bancada
no marco anterior.

---

## 2. As decisões que o Criador tomou

Quatro perguntas de direção, respondidas antes do plano:

| pergunta | resposta |
| --- | --- |
| cabelo `cacheado` da ficha ou longo esvoaçante da arte? | **a arte** |
| traje laranja da ficha ou branco translúcido da arte? | **a arte** |
| qual a assinatura de "arte"? | **fitas de cor envolvendo o corpo** |
| usar o campo de acessório, livre? | **sim — acessório exclusivo novo** |

---

## 3. Fronteiras com quem já tem marco

A Júpiter é quente, e há duas deusas quentes no elenco. A separação
tem de ser explícita, ou as três viram a mesma pessoa à distância.

| | paleta | matéria |
| --- | --- | --- |
| **Saturno** | `#ffd98a` · `#e08a2f` | ouro **em massa** — galhada, folha de vidro, pata. Animal, estação seca |
| **Amara** | `#ffe9a6` · `#c79a3a` | dourado suave, maternidade |
| **Júpiter** | `#ffb199` · `#c0392b` | **vermelho e pêssego**, fita lisa, branco translúcido |

Regras que este marco se impõe:

* o ouro da Júpiter é **fita fina e lisa**, como traço de tinta ou
  verniz — nunca galhada, nunca folha, nunca massa metálica;
* **nada de verde-oliva, galho, chifre, pata ou folha** — tudo isso é
  da Saturno;
* o **vermelho vivo domina** a silhueta: é a cor que nenhuma outra
  deusa tem, e é o que a separa da Saturno a cinquenta metros;
* **sem anel orbital** (Nexara), **sem vidro líquido iridescente em
  peça inteira** (Luma, `aurora`), **sem magenta/turquesa** (Lilly).

O ouro já existe no Éden fora da Saturno — o diadema da Suki usa
`0xf0c95a` em `Finish.Shine`. Não é território exclusivo; o que não
pode é a Júpiter usar ouro **da mesma maneira** que a Saturno.

---

## 4. O que será construído

### 4.1 Penteado `pincelada` — "Pincelada"

O cabelo da arte: vermelho vivo, muito longo, ondulado, com movimento.
O nome não é decorativo — a juba dela **é** uma pincelada de tinta
vermelha suspensa no ar, e é assim que será construída.

* **queda longa e ondulada**, descendo abaixo da linha do ombro, com
  seção funda atrás e rasa na frente (a lição do marco da Maze: frente
  rasa na linha do olhar, funda acima da testa, para cobrir a calota
  compartilhada sem engolir o rosto);
* **ondas** por relevo (`feature`), que custa zero triângulo — com
  bolha pequena e guarda de distância ao crânio, pela lição da Akemi;
* **mechas douradas** finas, poucas, correndo na massa vermelha;
* **brilho de luz** (`Finish.Shine`) nas pontas, discreto.

O `cacheado` sai da ficha e volta inteiro para os habitantes.

### 4.2 Traje `lumen` — "Traje Lumen"

O nome vem do **Pavilhão Lumen**, a galeria dela, que já está na ficha
e no diário. O traje é a obra que ela veste.

* **drapeado branco translúcido**, como na arte — o tecido claro é a
  tela;
* **fitas** largas e contínuas enrolando tronco e quadril, a
  assinatura escolhida pelo Criador. Elas carregam o **gradiente** da
  paleta dela: pêssego → laranja → vermelho, variando ao longo do
  comprimento;
* **fitas de ouro** finas acompanhando as de cor, como na arte;
* **nervuras de luz** (`Finish.Holo`) curtas, para o traje acender à
  noite sem virar pisca-pisca;
* a barra da saia recebe o fim das fitas, caindo soltas.

A lição mais cara do marco da Maze fica registrada aqui: **superfície
plana e larga não lê como pano neste render — lê como cartolina.** As
fitas serão construídas com volume e torção, não como tiras chapadas,
e serão validadas na bancada cedo.

### 4.3 Acessório `atelie` — "Ouro do Ateliê"

Joias douradas da arte, no campo livre dela:

* **gargantilha** em anel completo — a lição da Lilly: peça só na
  frente não lê como colar;
* **braceletes** nos dois braços;
* **brincos** curtos.

Fora do sorteio dos habitantes, como todas as peças de deusa.

---

## 5. Plano de LOD e orçamento

**Meta: LOD baixo abaixo de 6 300** — hoje 6 902, com teto em 7 145,6.
O ganho vem de largar o `cacheado`, que sozinho custa 1 170 ali.

Cortes planejados, pelo padrão já estabelecido nos marcos anteriores:

| nível | o que sobrevive |
| --- | --- |
| **baixa** | silhueta da queda, massa das fitas principais |
| **≥ 14 segmentos** | fitas secundárias, gargantilha, braceletes |
| **≥ 20 segmentos** | mechas douradas, nervuras `Holo`, brincos, brilho das pontas |
| **ultra** | 44 segmentos, relevo completo das ondas |

Nenhuma peça com contagem fixa. **Toda peça nova corta por
distância** — é a regra que o defeito do `cacheado` torna obrigatória
neste marco.

**Draw calls: 3 malhas**, sem exceção. Tudo mesclado no corpo.

---

## 6. O que não será tocado

* **`cacheado`** e **`vestido`** — peças de habitante, ficam como
  estão;
* **`longo`** e **`aero`** — Aérion e Amara;
* **`copa`/`jardim`** (Maze), **`silvestre`/`guardia`** (Saturno),
  **`fibra`/`sistema`** (Haru), **`fluxo`/`rede`** (Nexara),
  **`cascata`/`docente`** (Suki), **`onda`/`sonora`** (Lilly),
  **`cachos`/`cosplay`** (Akemi), **`ondulado`/`aurora`** (Luma);
* **`flor`, `oculos`, `fones`, `chapeu`, `cristal`, `aureola`,
  `lentes`** — acessórios já atribuídos;
* a **calota compartilhada** de `buildHair`, que serve os treze
  penteados — será **coberta**, nunca alterada;
* `buildSkirt`, `buildTorso`, `buildArm` e todo o resto da construção
  compartilhada;
* sistemas globais.

### O cânone preservado

`title` · `domain` · `colors` `['#ffb199', '#c0392b']` · `aura`
`0xff9f6a` · `tagline` · `place` (Pavilhão Lumen) · `contact` ·
`journal` · nós de diálogo · `skin` `#cf8f63` · `eyeColor` `#3b2a20` ·
`height` 1.0.

Muda apenas: `hairStyle`, `outfit`, `accessory`, e as cores de roupa
(`topColor`, `bottomColor`), que hoje são laranja e um azul-escuro que
não aparece na malha.

---

## 7. Testes previstos

Arquivo novo `tests/unit/jupiter-remaster.test.ts`, com cerca de 35
casos:

* **exclusividade** — as três peças novas no catálogo, nenhuma no
  sorteio de 60 habitantes, sobrevivência a `sanitizeAppearance`;
* **cânone** — título, domínio, aura, paleta, lugar, pele, olhos,
  altura;
* **cabelo** — queda abaixo do ombro, frente que não engole o rosto,
  franja cobrindo a calota compartilhada, relevo que desloca a
  superfície sem deformar o crânio, mechas douradas presentes;
* **traje** — fitas com gradiente de verdade (mais de um tom), nada
  enterrado dentro da saia (raio medido **nesta** malha), gargantilha
  em anel completo, braços nus preservados;
* **fronteira** — paleta disjunta da Saturno e da Amara, vermelho
  dominante, sem galhada/folha/anel orbital;
* **orçamento** — teto do LOD baixo, 3 malhas, custo crescente por
  nível, e **corte por distância de toda peça nova** (o defeito do
  `cacheado` não pode se repetir);
* **o resto do Éden** — Aérion, Amara e os habitantes intactos;
  `cacheado` e `vestido` continuam montando igual.

### O teste da Saturno terá de ser atualizado

`tests/unit/saturno-remaster.test.ts` afirma, nas linhas 146 e
219–220, que a Júpiter usa `cacheado` e `vestido`, com a justificativa
de que ela **ainda não foi remasterizada**. Depois deste marco a
justificativa deixa de valer.

A atualização será **deliberada e documentada**, como foi no marco da
Maze: o teste passará a afirmar o estado novo e canônico, com o mesmo
rigor, e continuará guardando o que sempre guardou — que o marco da
Saturno não encosta na Júpiter.

---

## 8. Validação

1. `npx tsc --noEmit` limpo;
2. `npm run build` ✓;
3. testes específicos da Júpiter;
4. `tests/unit/saturno-remaster.test.ts` verde após a atualização;
5. suíte geral, com as falhas preexistentes **medidas contra
   `0b14233` por `git stash`**, não presumidas;
6. **`tools/assinaturas.ts`** contra worktree em `0b14233`: todos os
   atributos de geometria e índices, as três malhas (corpo, rosto,
   halo), o Panteão e o catálogo inteiros nos quatro LODs. O
   resultado aceitável é **só `panteao/jupiter` divergente**, mais as
   linhas novas das peças exclusivas, e **zero perdidas**;
7. capturas antes/depois, diurnas e noturnas, mais costas, perfil e
   LOD baixo, em WebGL 2.0 real e sem erro de console.

---

## 9. Riscos declarados

1. **As fitas podem ler como cartolina.** É o risco número um, e já
   aconteceu: três tentativas de drapeado foram descartadas no marco
   da Maze por isso. Mitigação: volume e torção desde a primeira
   versão, validação na bancada antes de investir em quantidade.
2. **O ouro pode aproximá-la da Saturno.** Mitigação: ouro só em fita
   fina, vermelho dominante, e teste de disjunção de paleta.
3. **O gradiente pode virar sujeira.** Cor que muda ao longo de uma
   peça pequena lê como mancha. Mitigação: gradiente só em fitas
   longas, com poucos passos bem separados.
4. **O custo em `ultra` pode subir demais**, como subiu no marco da
   Maze (79 688, a mais pesada do elenco). Mitigação: as mechas e o
   brilho entram só no nível mais alto, e o orçamento será medido a
   cada rodada, não no fim.
5. **A calota compartilhada vai aparecer** se a frente do cabelo for
   rasa demais. É defeito conhecido, com correção conhecida: frente
   com duas alturas.

---

## 10. Autorização

Nada de geometria será escrito antes da aprovação deste plano. O PR
será aberto **e deixado aberto**, aguardando autorização expressa do
Criador, e nenhuma outra remasterização será iniciada nesta etapa.
