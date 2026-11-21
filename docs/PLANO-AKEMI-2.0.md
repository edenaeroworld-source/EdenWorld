# Plano — Akemi-Chan 2.0

Deusa da Cultura Otaku e do Fandom. Remasterização do pedido #50.

Ramo: `arena/9905e7b3-edenworld`, a partir de `35885a1` (`main`, já com
a Lilly 2.0 mesclada).

Este documento foi escrito e commitado **antes** de qualquer linha de
geometria, como o Criador fixou no fluxo depois do marco da Nexara.

---

## 1. O que já existe — investigação feita antes de decidir

### Ficha canônica (`src/characters/Pantheon.ts`)

| campo | valor atual |
|---|---|
| `id` / `name` | `akemi` / Akemi-Chan |
| `title` | Deusa da Cultura Otaku e do Fandom |
| `domain` | Anime, Mangá, Fandom, Cultura pop japonesa, Convenções |
| `colors` | `['#ffc1d6', '#e0417f']` |
| `aura` | `0xff9ec6` |
| `place` | em frente ao `mercado-eden` |
| `appearance` | `look('#ffe0c8','rabo','#ff8fc0','#7a5cc9','vestido','#ffffff','#ff6f91','#ffc1d6','chapeu',0.96)` |
| `handle` | `@akemichan` |

Altura `0,96` — ela é a mais baixa das remasterizadas até aqui.

### O que os catálogos dizem hoje

```
HAIR_STYLES          curto longo ondulado cascata fluxo onda rabo coque cacheado espetado careca
CITIZEN_HAIR_STYLES  exclui cascata, fluxo, onda
OUTFITS              casual aero vestido esportivo praia aurora docente rede sonora
CITIZEN_OUTFITS      exclui aurora, docente, rede, sonora
ACCESSORIES          nenhum oculos fones chapeu flor cristal aureola lentes
CITIZEN_ACCESSORIES  exclui apenas lentes
```

### As armadilhas deste marco

Este é o marco com mais peças compartilhadas em jogo até agora. **As
três características mais reconhecíveis da arte são todas genéricas:**

| peça da arte | onde mora hoje | pode ser alterada? |
|---|---|---|
| cabelo cacheado volumoso | `cacheado`, em `CITIZEN_HAIR_STYLES` | **não** |
| óculos redondos | `oculos`, em `CITIZEN_ACCESSORIES` | **não** |
| flores no cabelo | `flor`, em `CITIZEN_ACCESSORIES` | **não** |
| chapéu (ficha atual) | `chapeu`, em `CITIZEN_ACCESSORIES` | **não** |

É o mesmo caso dos `fones` da Lilly, triplicado. A lição vale igual:
peça que habitante herda não se remasteriza onde ela mora.

E há um segundo limite: `appearance.accessory` é **um campo só**. Ela
não pode usar óculos *e* flores como acessórios ao mesmo tempo, nem
que os dois fossem exclusivos. Acrescentar um acessório exclusivo novo
(como o `lentes` do Haru) resolveria um, nunca os dois.

### Limites de material

Não existe `transmission`, `transparent` nem `opacity` em
`BodyFinish.ts` nem em `Avatar.ts`. **O haori translúcido da arte não
pode ser translúcido de verdade.** Translucidez só se sugere com
`Finish.Glass` (reflexo) e `Finish.Holo` (emissão `0,55`), como foi
feito na saia da Lilly.

### O que já é assinatura de outra deusa

- **Anéis orbitando o corpo** → Nexara. Os anéis-portal da arte da
  Akemi não podem virar anéis orbitais, ou as duas leem igual.
- **Massa escura com pontas neon** → Lilly. O cabelo da Akemi precisa
  de outro recurso.
- **Sulcos verticais correndo a queda** → Nexara e Lilly.

### Defeito de motor conhecido, herdado do marco anterior

`blendStations` descarta `finish` e trava a cor na estação mais
próxima. Documentado na seção 5.3 de `VALIDACAO-LILLY-2.0.md`.
**Consequência para este marco:** qualquer varredura que precise de
acabamento ou degradê por anel não pode passar por `subdivideProfile`.

---

## 2. Decisões visuais — tomadas e reversíveis

As perguntas foram apresentadas ao Criador e ficaram sem resposta. O
briefing manda **não contradizer a ficha oficial**, então o critério
aplicado foi: *na dúvida, a ficha vence; onde a ficha é omissa, a arte
decide.* Cada decisão abaixo é reversível em uma linha.

### 2.1 Cabelo: estrutura da arte, identidade da ficha

A arte mostra cachos castanhos volumosos; a ficha diz `rabo` rosa
`#ff8fc0`. Mudar estilo e cor de cabelo é o que todos os marcos
anteriores fizeram — é remasterizar, não contradizer.

**Decisão:** estilo novo exclusivo `cachos`, base castanha da arte.
Em compensação, **`colors` e `aura` da ficha ficam exatamente como
estão** (`['#ffc1d6','#e0417f']`, `0xff9ec6`) — ao contrário do que
fiz na Lilly, onde os três mudaram. O rosa canônico dela continua
sendo o rosa dela; ele vive no traje, nos acentos e na aura.

Se o Criador preferir cabelo rosa, é trocar `hairColor` na ficha.

### 2.2 Óculos e flores nascem no penteado

**Decisão:** os dois são construídos dentro do case `cachos`, e a
ficha usa `accessory: 'nenhum'`. Os acessórios `oculos`, `flor` e
`chapeu` não são tocados — e isso será provado por hash.

É o padrão que funcionou nos fones da Lilly, e é a única forma de ela
ter óculos **e** flores ao mesmo tempo.

### 2.3 Os mundos ao redor viram painéis, não anéis

**Decisão:** em vez de anéis-portal (que são da Nexara), ela recebe
**cartões holográficos achatados**, do tipo que a própria arte põe
flutuando ao lado dela — os painéis "EDEN AERO" com retratos e
glifos. Ficam presos ao tronco, abertos em leque atrás dos ombros,
acompanhando o corpo. Nada flutua solto.

Gate em `detail.segments >= 14`: no LOD de longe eles não existem.

### 2.4 O traje é uma peça só

**Decisão:** traje exclusivo `cosplay`, com as duas camadas da arte
num único traje: gola marinheiro, laço grande no peito, saia plissada
e haori longo aberto por cima. Meias altas brancas.

---

## 3. Identidade visual pretendida

| | Akemi-Chan 2.0 |
|---|---|
| Silhueta | ampla no alto (cachos) e leve embaixo (saia plissada curta + meia alta) |
| Recurso exclusivo do cabelo | **campo de cachos** — superfície quebrada por bolhas arredondadas |
| Recurso exclusivo do traje | gola marinheiro + laço + haori aberto |
| Elemento de domínio | cartões holográficos em leque |
| Paleta | castanho `#6b4a35` · lilás `#c9a7ff` · rosa `#ffc1d6` · magenta `#e0417f` · branco `#ffffff` |
| Olhos | `#7a5cc9` — **preservado da ficha**, e a arte concorda |
| Pele | `#ffe0c8` — preservado |
| Altura | `0,96` — preservado |

### Por que "campo de cachos" e não bolas

O `cacheado` compartilhado resolve cacho com **12 esferas** coladas na
cabeça. Isso custa geometria e lê como amora.

A Akemi usa outra coisa: a queda é uma varredura contínua, como a das
outras deusas, e os cachos são **relevo** — `feature()` aplicado num
campo de pontos sobre a superfície. `feature()` desloca vértices que
já existem: **custa zero triângulos**. É um recurso que nenhuma outra
deusa usou e que resolve exatamente o problema de volume cacheado.

Limite conhecido, medido no marco da Nexara: relevo mais estreito que
o vão entre vértices não existe. O raio de cada cacho tem de ser maior
que o passo angular da malha, e isso será medido antes de escolher a
contagem.

---

## 4. Orçamento

Teto exigido: **< 7 145 triângulos no LOD baixo**.

Referência das outras (LOD baixo): padrão 6 118 · Nexara 6 420 ·
Suki 6 592 · Lilly 6 768 · Luma 7 028.

Plano de gasto:

| peça | LOD baixo | de `media` para cima |
|---|---|---|
| queda `cachos` | varredura simples, poucos anéis | anéis cheios |
| relevo dos cachos | **não existe** (`segments >= 14`) | zero triângulos (`feature`) |
| óculos | aro fino | aro + lente |
| flores | 1 flor | 3 flores |
| gola, laço, saia plissada | sim, simplificados | completos |
| haori | silhueta | com barra e punhos |
| cartões holográficos | **não existem** | 4 a 6 cartões |

Nada de objeto à parte seguindo osso: tudo é geometria mesclada no
corpo, para manter **paridade de draw calls**.

---

## 5. Arquivos que serão modificados

| arquivo | mudança |
|---|---|
| `src/player/AvatarAppearance.ts` | `cachos` em `HAIR_STYLES`, `cosplay` em `OUTFITS`, ambos fora das listas de habitante; rótulos |
| `src/player/body/BodyBuilder.ts` | flags do traje `cosplay`; `buildCosplaySuit()`; case `cachos`; óculos e flores dentro dele; cartões holográficos |
| `src/characters/Pantheon.ts` | `appearance` da Akemi (só ela) |
| `lab.html` | opção `akemi` no seletor de deusa |
| `tests/unit/akemi-remaster.test.ts` | suíte nova |
| `docs/VALIDACAO-AKEMI-2.0.md` | relatório |
| `docs/validacao/akemi/*.png` | capturas |

**Não serão tocados:** `BodyFinish.ts`, `BodySurface.ts`
(`blendStations` incluída), `BodyRig.ts`, os cases `cacheado`,
`oculos`, `flor`, `chapeu`, nem a ficha de qualquer outra personagem.

---

## 6. Prova de isolamento

`git worktree add /tmp/base 35885a1`, as duas árvores construídas pelo
mesmo script, SHA-1 sobre `position`, `normal`, `aFinish`, `color` e o
índice, nos quatro LODs, para:

- as dez outras personagens do panteão;
- habitantes usando `oculos`, `flor`, `chapeu`, `cacheado` e `vestido`
  — as cinco peças que esta remasterização chega perto de encostar.

Todos têm de sair idênticos.

---

## 7. Testes previstos

1. Akemi continua sendo a Akemi: `id`, título, olhos, pele e altura.
2. `cachos` e `cosplay` fora do sorteio; mil habitantes com semente
   fixa não vestem nenhum dos dois.
3. `oculos`, `flor`, `chapeu` e `cacheado` com hash idêntico antes e
   depois de construir a Akemi.
4. Os óculos existem sem acessório, e nascem com o penteado.
5. Cartões holográficos somem no LOD de longe.
6. Relevo dos cachos: a superfície do cabelo tem variação de raio
   maior que um limiar medido — se o relevo for raso demais, ele não
   existe na tela e o teste falha.
7. Cabelo não atravessa os braços.
8. Nuca coberta, por traçado de raios.
9. Teto de triângulos no LOD baixo; paridade de draw calls; os quatro
   LODs constroem com detalhe crescente.

---

## 8. Validação e capturas

Portão: `npx tsc --noEmit && npx vitest run && npm run build`.

Capturas em `docs/validacao/akemi/`: antes e depois de corpo, costas e
rosto; depois de perfil, andando e noturno. Mesma iluminação e mesmo
enquadramento nos pares.

Falha pré-existente conhecida: `coracao-roseiral.test.ts`, flaky, será
reproduzida na base limpa `35885a1` e documentada, nunca mascarada.

---

## 9. Riscos identificados

| risco | mitigação |
|---|---|
| Cacho raso demais não aparece | medir a amplitude do relevo contra o passo da malha antes de fixar a contagem |
| Cacho fundo demais vira amassado | medir o raio mínimo da queda; o relevo não pode cruzar o eixo |
| Cabelo volumoso atravessa os braços | foi o que aconteceu na Lilly; medir folga faixa a faixa e recuar a queda |
| Cartões em leque lendo como asas ou mochila | manter achatados, colados às costas e pequenos; medir e capturar antes de fixar |
| Óculos grandes demais viram máscara | a cabeça tem `R = 0,176`; o aro sai de `R·0,26`, como o genérico |
| Haori largo somando com cachos largos | medir a silhueta total; a leitura tem de continuar sendo pessoa |
| Saia plissada é geometria compartilhada | a saia curta é do catálogo; o plissado tem de ser relevo ou peça própria, nunca alteração da saia comum |

---

## 10. Fora de escopo

- Qualquer outra deusa, **Saturno incluído** — o Criador foi explícito.
- O defeito de `blendStations` (seção 1), que é do motor e merece PR
  próprio.
- O `coracao-roseiral` flaky.
- Qualquer alteração na `main`.
- Merge: o PR fica aberto aguardando autorização expressa.
