# Plano — Saturno 2.0

Remasterização visual de **Saturno, Defensora dos Animais**, primeira
filha de Adão e Eva. Branch `arena/6e42e2bf-edenworld`, a partir de
`d258cf3`.

Escrito **antes** de qualquer geometria, como nos marcos da Nexara,
da Suki, da Luma, da Lilly e da Akemi.

---

## 1. A ficha atual, lida antes de qualquer desenho

```
look('#a96c45', 'cacheado', '#8a5a2b', '#c98a2b', 'casual',
     '#ffd84a', '#7ddc5a', '#f3ead6', 'flor', 1.0)
colors: ['#ffd98a', '#e08a2f']     aura: 0xffd98a
title: 'Defensora dos Animais'
domain: Animais · Bem-estar animal · Proteção da natureza · Cultura pet
tagline: 'Primeira filha de Adão e Eva; fala por quem não fala.'
place: em frente à Casa EdenPawl
```

Pele castanha `#a96c45`, cabelo castanho `#8a5a2b`, olhos âmbar
`#c98a2b`, topo amarelo `#ffd84a`, baixo verde `#7ddc5a`, acento creme
`#f3ead6`, altura `1,0`.

---

## 2. Dois achados que mudam o desenho

### 2.1 A Maze já é a Deusa da Natureza

| | Saturno | Maze |
|---|---|---|
| Título | **Defensora dos Animais** | **Deusa da Natureza** |
| Domínio | Animais, bem-estar animal, cultura pet | Vegetação, ecossistemas, botânica |
| Paleta | `#ffd98a` · `#e08a2f` (dourada) | `#9df0b0` · `#1fae6b` (verde) |
| Remasterizada? | é este marco | **ainda não** |

A arte de referência é uma deusa-floresta verde. Seguida ao pé da
letra, ela entrega à Saturno exatamente o território da Maze — e a
Maze ainda nem foi feita. **O eixo da Saturno é ANIMAL; o da Maze é
VEGETAL.** Folhagem entra como cenário e material; o que precisa
gritar na silhueta é bicho.

### 2.2 A Saturno já está estourada no orçamento

Medido na `d258cf3`, LOD baixo, teto de **7 145,6** (o avatar antigo
inteiro + 10%, que é o que o `NpcSystem` assume com 54 pessoas em
cena):

| avatar | LOD baixo | |
|---|---|---|
| **Saturno** | **7 630** | **ESTOURADA em 484** |
| Luma | 7 028 | ok |
| Maze | 7 024 | ok |
| Júpiter | 6 902 | ok |
| Lilly | 6 768 | ok |
| Akemi | 6 648 | ok |
| Nexara | 6 420 | ok |

A causa, medida peça a peça:

- o acessório **`flor` custa 912 triângulos** — seis `ball` sem
  **nenhum** corte por LOD;
- o cabelo **`cacheado` custa 1 170** — doze `ball` coladas na cabeça.

É falha **preexistente**, anterior a este marco, e vira meta: a
Saturno 2.0 tem de **entrar** no teto, não apenas não piorar.

### 2.3 As três armadilhas de compartilhamento

Os três campos da aparência dela são compartilhados:

| campo | valor | quem mais usa |
|---|---|---|
| `hairStyle` | `cacheado` | habitantes **e Júpiter** |
| `outfit` | `casual` | habitantes |
| `accessory` | `flor` | habitantes **e Maze** |

Remasterizar qualquer um no lugar onde mora muda habitante sorteado e
ainda quebra Júpiter ou Maze. Vale o padrão já validado na Lilly e na
Akemi: **estilo e traje exclusivos, fora das listas de habitante, e
acessório nascendo dentro do penteado**, com `accessory: 'nenhum'`.

---

## 3. Decisões do Criador

Perguntado antes de desenhar; respondido:

1. **Paleta: dourado e verde em pé de igualdade.** Folhagem verde
   translúcida sobre base dourada.
2. **A ficha pode ser ajustada** se o visual pedir.
3. **Assinatura: galhada em vidro _e_ emblema de pata EdenPawl.**

Como a paleta aproxima da Maze por decisão explícita, a separação
passa a ser carregada pelos outros eixos, e isso é deliberado:

- **a aura continua dourada** (`0xffd98a`) — é o diferenciador mais
  barato e mais visível contra uma Maze verde;
- **a silhueta é animal**: galhada na cabeça, pata no peito;
- o verde entra como **vidro translúcido**, não como pano. A Maze
  terá vegetação de pano; a Saturno tem folha de vidro.

---

## 4. O que vai ser construído

### 4.1 Penteado exclusivo `silvestre`

Entra em `HAIR_STYLES`, **fora** de `CITIZEN_HAIR_STYLES`.

- Queda **longa e pesada**, passando bem do ombro — o oposto da
  Akemi, que é larga e curta, e distinta da `cascata` reta da Suki.
- Mechas trançadas de vinha sugeridas por **relevo** (`feature()`),
  custo zero em triângulos.
- Degradê castanho→dourado na ponta, com o dourado da ficha.

### 4.2 A galhada, dentro do penteado

Chifres de cervo estilizados, em `Finish.Glass` dourado, nascendo
acima das têmporas. Dois a quatro ramos por lado conforme o LOD.
Nascem no case do penteado, **não** como acessório — `oculos`, `flor`
e `chapeu` são de habitante, e `accessory` é um campo só.

### 4.3 Traje exclusivo `guardia` (Traje Guardiã)

Entra em `OUTFITS`, **fora** de `CITIZEN_OUTFITS`.

- Túnica dourada de base, em **pano** (não em vidro — lição da coxa
  envernizada da Akemi: `cloth` em `Glass` contamina a perna inteira).
- **Manto de folhas de vidro verde** nos ombros e descendo pelas
  costas: é aqui que mora o Frutiger Aero.
- Cinto/faixa dourada e saia longa aberta.
- **Emblema de pata** aceso no peito, em `Finish.Holo`.

### 4.4 Paleta

| papel | cor |
|---|---|
| Base dourada | `#e0a83a` |
| Luz âmbar / aura | `#ffd98a` |
| Folha de vidro | `#7ddc5a` (o verde que já está na ficha) |
| Folha funda | `#2f8f4e` |
| Creme / acento | `#f3ead6` |
| Cabelo | castanho `#8a5a2b` → dourado na ponta |

---

## 5. Orçamento

Meta: **abaixo de 7 145,6** no LOD baixo, vindo de 7 630.

A conta fecha porque o que sai é caro e o que entra é barato:

| | |
|---|---|
| sai o `cacheado` | −1 170 |
| sai a `flor` | −912 |
| entra queda longa com relevo | relevo custa **zero** |
| entra galhada, folhas e pata | **cortadas por LOD** |

Galhada, folhas de vidro e emblema só existem de perto. No LOD de
longe sobra a silhueta, que é o que se vê a três metros.

---

## 6. Riscos conhecidos

1. **Deformar o crânio.** `feature()` empurra todo vértice ao
   alcance. Na Akemi isso amassou a cabeça em 35 mm. Vale o mesmo
   teste de elipsoide, e o mesmo caso de regressão.
2. **Colidir com a Maze.** Mitigado por aura dourada, galhada, pata e
   folha de **vidro**.
3. **Vidro na base do traje.** Não repetir: `cloth` fica em pano, e o
   vidro é pedido peça a peça.
4. **`subdivideProfile` descarta `finish`** — perfil com acabamento
   por anel nasce na densidade final.
5. **Geometria enterrada.** Medir a frente do torso antes de pôr o
   emblema, como foi preciso fazer com o laço da Akemi.
6. **A galhada invadindo o corredor do braço** (`|x|` 0,13–0,28) ou
   atravessando o cabelo.
7. **Estourar o teto**, que aqui começa já estourado.

---

## 7. Testes previstos

1. `silvestre` em `HAIR_STYLES`, fora de `CITIZEN_HAIR_STYLES`.
2. `guardia` em `OUTFITS`, fora de `CITIZEN_OUTFITS`.
3. Nenhum habitante sorteado recebe os dois (2 000 sorteios).
4. Ambos sobrevivem ao saneamento.
5. A ficha usa os exclusivos e `accessory: 'nenhum'`.
6. **Entra no teto de 7 145,6** — o caso que hoje falharia.
7. Continua em 3 malhas.
8. A galhada existe, é `Glass` e fica fora do corredor do braço.
9. O emblema de pata existe, é `Holo` e fica à frente do torso.
10. Vidro e holografia presentes em todos os LODs.
11. O relevo não deforma o crânio (erro < 2 mm contra gabarito).
12. Crânio tão redondo quanto o das outras deusas.
13. Júpiter (que usa `cacheado`) e Maze (que usa `flor`) intactas.
14. Avatar padrão e demais deusas com custo inalterado.

---

## 8. Portão antes do PR

- `npx tsc --noEmit`
- `npx vitest run` (suíte geral)
- `npm run build`
- Comparação de **hashes de todos os outros avatares em 4 LODs**
  contra `d258cf3`, incluindo habitantes sorteados
- Capturas antes/depois, diurnas e noturnas
- Falha preexistente documentada, nunca mascarada

Sabe-se de uma: `coracao-roseiral.test.ts` falha por timeout na base
limpa. Será verificada de novo em worktree separada.

---

## 9. Publicação

PR **"Saturno 2.0 — Remasterização Oficial"**, aberto e **sem merge**,
aguardando autorização expressa. Haru não começa neste marco.
