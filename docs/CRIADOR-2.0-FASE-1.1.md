# EdenWorld 2.0 — Fase 1.1 — Criador de Avatares 2.0

Entrega nos nove pontos pedidos. A inspiração declarada é a **organização**
do criador do Wii — uma pergunta por vez, resposta sempre visível no boneco —,
nunca a arte nem a técnica da Nintendo. Tudo aqui é geometria e estética do
próprio EdenWorld.

---

## 1. Diagnóstico da arquitetura anterior

A auditoria (feita antes de qualquer escrita) encontrou **quatro problemas**,
todos de lógica e nenhum de desenho:

| # | O que estava errado | Prova colhida na auditoria |
|---|---|---|
| 1 | **O criador ignorava o gênero.** Não havia tela Ele/Ela; a lista era `CREATOR_*` = o catálogo inteiro menos as duas peças do Aérion. | Painel montado em teste mostrava as 26 opções de cabelo a qualquer jogador |
| 2 | **O Aleatório era cego.** `randomAppearance` escrevia `sex: 'fem'` fixo. | 200 sorteios ⇒ `{fem}` 200 vezes |
| 3 | **Peças do Panteão abertas no criador**: 9 cabelos, 10 roupas e 3 acessórios de deusa, inclusive `lentes`, `atelie` e `nimbo`. | Listagem direta dos catálogos |
| 4 | **A silhueta nunca chegava ao jogador.** O campo `sex` existia na ficha e era salvo, mas o corpo saía sempre com as proporções de referência. | 27 dos 54 cidadãos masculinos tinham corpo feminino |

O que **já estava certo** e foi preservado: o saneamento de save
(`sanitizeAppearance`), a pré-visualização ao vivo, o rig de 19 ossos, os
quatro níveis de detalhe e o respeito às fichas oficiais via
`createOfficialAvatar`.

### Limitação arquitetural encontrada e resolvida

A etapa "rosto" do fluxo pedido **não existia**: as medidas do rosto eram
`FACE`, um `Object.freeze` global compartilhado por todos os avatares do jogo.
Mexer nele mudaria o rosto das dez deusas. Em vez de inventar a categoria ou
fingir que ela existia, foi implementado `faceDimsFor(face, R, cy)`, que
deriva as medidas por ficha a partir de multiplicadores neutros em 1 — quem
não tem os campos recebe exatamente a malha de antes.

---

## 2. Arquivos modificados e criados

**Modificados (13):**

| Arquivo | O que mudou |
|---|---|
| `src/player/AvatarAppearance.ts` | `GODDESS_ONLY_*`, `CREATOR_*_BY_SEX`, `CREATOR_ACCESSORIES`, `catalogWithLegacy`, `isLegacyPiece`, `coerceAppearanceToSex`, 4 eixos de rosto, `randomAppearance(rng, sex)`, 14 peças novas |
| `src/interface/AvatarCreator.ts` | Reescrito: tela Ele/Ela, trilha de 6 etapas, réguas de rosto, resumo, rodapé |
| `src/player/body/BodyBuilder.ts` | 9 cortes de cabelo novos, 5 roupas novas, rosto por ficha |
| `src/player/body/BodyRig.ts` | `FaceDims`, `faceDimsFor()`, `BROW_LIFT_BASE` |
| `src/player/AvatarFace.ts` | Medidas por ficha em vez de constantes de módulo |
| `src/player/Avatar.ts` | `shape`, `pinnedShape`, reconstrução ao trocar de silhueta |
| `src/player/body/BodyShape.ts` | `shapeForSex(sex)` |
| `src/styles/main.css` | 183 linhas: cartões de vidro, trilha, resumo, telas estreitas |
| `src/characters/Pantheon.ts` · `src/npc/CitizenData.ts` | Rosto neutro declarado (população fora de escopo) |
| `tests/unit/aerion-cosmos.test.ts` · `avatar.test.ts` · `saturno-remaster.test.ts` | Contratos antigos **repontados** para a regra nova |

**Criados (2):** `tests/unit/criador-genero.test.ts` (33 casos) e
`docs/criador-2.0-antes-depois.svg`.

Total: **+1 223 linhas, −152**.

---

## 3. A nova interface

1. **Tela Ele / Ela.** Dois cartões grandes de vidro líquido — azul para Ele,
   verde para Ela —, cada um com a silhueta desenhada em SVG, o número de
   peças do acervo e brilho de vidro no topo. Passar o cursor (ou o foco do
   controle) já troca o boneco atrás: a escolha é vista antes de ser feita.
   Em telas estreitas os cartões empilham e viram linha.
2. **Trilha de etapas** — Rosto · Cabelo · Roupa · Acessórios · Ajustes ·
   Confirmar. É um `tablist` de verdade: navegável por teclado, por LB/RB no
   controle, e com a etapa corrente em degradê ciano→azul.
3. **Uma pergunta por vez.** Cada etapa mostra um só catálogo, grande e
   tocável — em vez das quatro listas empilhadas de antes.
4. **Etapa de rosto:** quatro réguas (olhos, distância, sobrancelha, boca),
   rotuladas `padrão` / `+8%` / `−5%`, nenhuma obrigatória.
5. **Confirmação** com resumo em fichas: silhueta, cabelo, roupa, acessório,
   altura.
6. **Aleatório** em todas as etapas; **nunca** sorteia a silhueta — a escolha
   da pessoa é a única coisa que o dado não mexe.
7. Quem **edita** um personagem entra direto no rosto, sem a tela de escolha:
   o gênero é o que ela já tinha.

Estética: Frutiger Aero do resto do Éden — branco translúcido, ciano, azul e
verde, luz de cima, sombra azul-profunda, cantos de 24 px.

---

## 4. Como os catálogos funcionam agora

```
HAIR_STYLES / OUTFITS / ACCESSORIES     o acervo inteiro do jogo
  − AERION_ONLY_*                       cosmos, criador
  − GODDESS_ONLY_*                      9 cabelos, 10 roupas, 3 acessórios
  = CITIZEN_*                           o que a praça pode usar
  → forSex(..., AUDIENCE, sex)          CREATOR_*_BY_SEX
```

A separação vale **em três camadas**, e não só na tela:

- **catálogo** — `CREATOR_HAIR_BY_SEX[sex]` é a única fonte da lista;
- **seleção** — `coerceAppearanceToSex()` conserta a ficha ao trocar de
  gênero: peça incompatível cai na primeira do catálogo novo, cor, altura e
  rosto nunca mudam;
- **sorteio** — `randomAppearance(rng, sex)` só sorteia dentro do catálogo
  daquele sexo.

**Peça herdada:** quem já usava uma peça hoje exclusiva (uma veterana de Manto
Aurora) continua com ela. `catalogWithLegacy` acrescenta a peça **no fim** da
lista, marcada "(seu visual atual)", com uma nota explicando que ela não volta
depois de trocada. O catálogo não cresce para mais ninguém.

### O acervo, antes e depois

| | antes (o que a tela mostrava) | depois da limpeza | **depois da reposição** |
|---|---|---|---|
| Cabelos — Ele | 26 (10 legítimos) | 10 | **13** |
| Cabelos — Ela | 26 (11 legítimos) | 11 | **20** |
| Roupas — Ele | 19 (7 legítimos) | 7 | **10** |
| Roupas — Ela | 19 (5 legítimos) | 5 | **10** |

As 14 peças de reposição (9 cabelos, 5 roupas) são **cortes**, não recolorações:
cada uma tem malha própria e distinta das demais, provado por hash de posições.

---

## 5. Resultados dos testes

**Suíte nova `tests/unit/criador-genero.test.ts` — 33 casos, todos verdes:**

| Bloco | Casos | O que prova |
|---|---|---|
| Escolha Ele/Ela | 4 | a tela oferece as duas; cada uma marca a ficha; editar preserva o gênero |
| Catálogos separados | 5 | só o catálogo do sexo aparece; a troca conserta a ficha por dentro; peça neutra não é mexida |
| Panteão intocado | 4 | nenhuma peça de deusa ou do Aérion em lugar nenhum; 11 fichas oficiais sem mudança de silhueta nem de rosto |
| Aleatório | 4 | **1 600 sorteios** sem um vazamento; rosto dentro da faixa; o botão respeita a escolha |
| Silhueta no corpo | 4 | Ele recebe corpo masculino; a troca reconstrói e volta idêntica; os **quatro níveis gráficos** |
| Rosto | 4 | eixos neutros; save antigo abre igual; valor fora de faixa é preso |
| Reposição | 5 | 14 peças, 14 malhas distintas; custo sob o teto; o sorteio alcança todas |
| Compatibilidade | 3 | peça herdada sobrevive e aparece marcada |

**Regressão geral:** `398 suítes · 1 576 testes · 1 564 ok · 11 pulados ·
1 falha`. A falha é `coracao-roseiral.test.ts`, timeout preexistente de antes
da fase, fora de escopo. A linha de base era `1 543 · 1 531 · 1 falha` — os
33 testes novos entraram todos verdes e nada quebrou.

**Duas testemunhas antigas foram repontadas, nunca afrouxadas:**
`aerion-cosmos` afirmava "o criador oferece tudo menos as 2 peças do Aérion" e
agora afirma a regra nova, atravessando a tela de escolha; `avatar.test.ts`
usava `'moicano'` como exemplo de valor inválido — a Fase 1.1 fez dele um
penteado de verdade, então o exemplo virou um nome que não existe.

**Cobertura exaustiva:** as **330 combinações** de catálogo (todo cabelo ×
toda roupa × os dois sexos) foram construídas sem exceção.

---

## 6. Impacto no desempenho

| Medida | Antes | Depois |
|---|---|---|
| JS (gzip) | 405,87 kB | 408,81 kB (+2,94) |
| CSS (gzip) | 9,88 kB | 10,36 kB (+0,48) |
| Avatar médio em `alta` | ~10,7 mil vértices | ~10,7 mil vértices |
| Pior corte novo (`trancinhas`) | — | 11 397 v, **abaixo** do `cacheado`, que já era o teto |

Custo medido em 200 sorteios por nível: `ultra` 35 089 v · `alta` 10 736 v ·
`media` 6 656 v · `baixa` 4 039 v. As trancinhas nasceram com 7 fios de 4
contas e passaram do teto; foram reduzidas a 5 fios de 3 contas, que lê igual
de longe e cabe. **Nenhum vértice a mais no avatar médio** — as peças novas
são combinações de corte, não geometria acrescentada por cima.

---

## 7. Compatibilidade com saves

- **`SAVE_VERSION` continua em 3.** Nenhuma necessidade técnica de subir:
  todos os campos novos são opcionais com neutro definido.
- Save anterior à fase, sem os quatro eixos de rosto, abre com **a mesma malha
  de antes** — provado por hash: ficha padrão e ficha sem os campos dão
  `4452v:2058542774`, idêntico.
- Valor fora de faixa é preso na faixa; lixo (`'grande'`, `null`) vira 1.
- Save sem `sex` continua caindo em `fem`, como sempre caiu.
- Peça hoje exclusiva já gravada numa ficha **não é derrubada** pelo
  saneamento.
- Nenhuma migração foi escrita, porque nenhuma é necessária.

---

## 8. Comparação visual antes/depois

`docs/criador-2.0-antes-depois.svg` — as duas telas lado a lado, com as 22
peças do Panteão destacadas em rosa na tela antiga.

**Limitação honesta:** o sandbox não tem Chromium nem WebGL, então não há
captura de tela real nem comparação pixel a pixel. A prova de que a geometria
mudou (ou não mudou) é feita por **hash das posições da malha**, que é mais
estrito que olhar: ele pega diferenças que o olho não veria. A conferência
visual no navegador fica com você — a prévia está no ar.

---

## 8-bis. Auditoria integrada (posterior a esta entrega)

A auditoria completa está em **`docs/AUDITORIA-FASE-1.1.md`**, com inspeção
visual peça a peça (folhas em `docs/auditoria-1.1/`), prova de integridade do
Panteão contra a `main` e teste mutacional. Ela corrigiu sete acabamentos
(`pixie`, `trancinhas`, `moicano`, `meiopreso`, `repicado`, `macacao`, `maio`)
e um defeito preexistente: a auréola não acendia na construção do avatar, o
que deixava o **Aérion sem a auréola da ficha dele**.

Num acabamento posterior ela corrigiu ainda a **`tranca`**, peça antiga que
era um colar de contas desencostadas: em `baixa`, 40 % da altura da peça era
ar. Virou fio contínuo com os nós preservados, a +0,5 % de vértices e sob o
teto do acervo. Detalhe na seção 9 do relatório.

Números após a auditoria: **1 600 testes · 1 588 ok · 1 falha preexistente**;
avatar 0,5 % mais leve que na `main`; `SAVE_VERSION` continua em 3.

## 9. Riscos restantes

1. **Conferência visual pendente** — os 9 cortes e as 5 roupas foram provados
   por malha distinta e custo, não por olho humano. Vale abrir os catálogos no
   navegador e olhar os 14.
2. **`coracao-roseiral.test.ts`** continua intermitente por timeout. É
   anterior à fase e não tem relação com o criador.
3. **A população usa o acervo novo.** Por decisão explícita (`jogador-cidade`),
   as 14 peças entraram também no sorteio dos cidadãos — a praça fica mais
   variada, mas os cidadãos de uma mesma semente mudaram de roupa em relação a
   antes da fase. Nenhum teste dependia disso.
4. **Acessórios não têm eixo de sexo.** Não existe `ACCESSORY_AUDIENCE` no
   jogo; os 7 comuns são oferecidos aos dois. Criar o eixo seria inventar
   categoria sem suporte — ficou registrado em comentário no código.
5. **Pendência herdada da Fase 1:** a conferência visual do Aérion nos quatro
   níveis gráficos continua aberta.
