# Plano — Suki-Chan 2.0

Remasterização visual da Deusa da Inteligência e da Educação, para
revisão do Criador **antes** de uma linha de geometria ser escrita.

---

## 1. Por que este documento existe

A Suki-Chan 2.0 já tinha sido construída uma vez, no commit `52fe62e`.
Esse commit nunca foi publicado — ficou só no disco de uma sessão, por
decisão de não empurrar nada enquanto o PR da Luma estivesse aberto —
e desapareceu junto com aquele ambiente. A verificação foi exaustiva:
`git cat-file` nos SHAs, `fsck --lost-found`, reflog, stash, as
dezoito branches do remoto, `ls-remote --tags` e a API do GitHub.
Todos negativos. Não há o que recuperar.

O que sobreviveu foi a **especificação aprovada**. Este plano a
reconstrói, ancorada em medições feitas na base atual, e serve de
contrato para a reimplementação.

Uma medição confirma que a reconstrução é fiel: o commit perdido
registrava **6 636 triângulos no nível baixo**, e a combinação
equivalente medida hoje nesta base dá **exatamente 6 636**. A
especificação abaixo não é memória solta — ela bate com o número.

## 2. Base

| item | valor |
|---|---|
| branch | `arena/e69a170d-edenworld` |
| base | `69a9d3a` — `main` já com a Luma 2.0 integrada |
| `Finish.Glass` | **existe** (índice 6, veio com a Luma) |
| `CITIZEN_HAIR_STYLES` | **não existe** — a Suki vai criá-lo |
| bancada | modo `luma`, a generalizar para `deusa` |
| ficha atual | `look('#f6c9a4', 'coque', '#2b1d16', '#2f9a66', 'casual', '#f3ead6', '#24e08a', '#ffffff', 'oculos', 0.97)` |

A base é melhor do que a da primeira tentativa: o `Finish.Glass` já
chegou pela Luma, então o diadema e as lentes nascem com vidro
pronto, sem precisar criar acabamento novo.

## 3. A referência

Da arte enviada pelo Criador, o que é geometria:

- **cabelo preto, liso e longuíssimo**, caindo bem abaixo da cintura,
  com volume nas laterais e mechas que passam à frente do ombro;
- **diadema dourado** com pontas verticais e **gemas ciano** em gota;
- **vestido magenta** de **decote em V** e **manga três-quartos**;
- **pele morena clara**, mais quente que a atual;
- óculos — que ela já usa e continuam na ficha.

Os livros que ela carrega são cenário, não avatar. Ficam de fora,
como os ícones de rede da Nexara ficaram.

## 4. O que não muda

Cânone intocado: `id`, `name`, `title` (*Deusa da Inteligência e da
Educação*), `domain`, `colors`, `tagline`, `bio`, `place`
(Estufa Celeste), `aura`, `contact`, persona, voz, missões e diário.
A remasterização é de aparência. Ela continua a professora de
biologia.

Da ficha, muda só a linha `appearance`.

## 5. Peça por peça

### 5.1 Cabelo `cascata`

Estilo novo, exclusivo dela. O que o separa dos dois longos que já
existem:

| | `longo` | `ondulado` (Luma) | `cascata` (proposto) |
|---|---|---|---|
| ponta | `cy − 0.26` | `cy − 0.52` | **`cy − 0.72`** |
| contorno | reto | ondula ±16% | liso, alarga no meio |
| mechas | — | sulcos esculpidos | duas à frente do ombro |

- anéis: `segments >= 26 ? 10 : segments >= 14 ? 8 : 4` — o mesmo
  escalonamento da Luma, que é o que mantém o nível baixo no
  orçamento;
- o raio **cresce** para baixo até cerca de 70% da queda e só então
  arredonda. Afinar em direção à ponta afunda o cabelo no tronco —
  erro já cometido e medido;
- cor contínua: `lerp` de `#1a1a22` para `shade(-0.18)` ao longo de
  `t`. **Não** alternar cor por anel: alternância vira zebra;
- esqueleto em rampa de dois ossos (`bone: Head`, `bone2: Torso`,
  `blend` por altura), que já é como o braço e a perna funcionam
  nesta base. Sem isso um cabelo deste comprimento gira rígido com o
  pescoço;
- as duas mechas frontais só a partir de `segments >= 14`.

### 5.2 Diadema

A ficha dela tem **um** campo de acessório, e ele está ocupado pelos
óculos. Então o diadema **não** é um acessório: é parte do penteado
`cascata`, construído por uma função `buildDiadem` chamada de dentro
do `case 'cascata'`. É o mesmo padrão dos anéis orbitais da Nexara,
que nasceram dentro do cabelo pela mesma razão.

- aro: toro achatado no crânio, `cy + 0.09`, raio `R * 1.06`, dourado
  `0xf0c95a`, acabamento `Finish.Shine`;
- pontas: cinco placas verticais na frente, a central mais alta;
- gemas: três gotas em `Finish.Glass`, cor `0x8fe3ff`;
- no nível baixo, aro e três pontas; gemas e pontas externas atrás do
  portão `segments >= 14`.

**Consequência a aprovar:** quem escolher `cascata` no criador de
avatar leva o diadema junto. Foi assim que a Nexara resolveu o mesmo
problema. A alternativa é gastar o campo de acessório e ela perder os
óculos.

### 5.3 Vestido Docente — `docente`

Roupa nova, exclusiva dela.

- `dress = true` → usa a saia que já existe;
- barra em `SKIRT_HEM_Y` (−0,36), na altura do joelho — é a barra que
  produz o 6 636 medido. A barra longa (−0,46, a do Manto Aurora)
  custaria **+164 t** e também caberia; **ver pergunta Q2**;
- **manga três-quartos sai de graça**: basta `docente` não entrar nem
  em `shortSleeve` nem em `longSleeves`. A manga então vai do ombro
  até logo abaixo do cotovelo e o antebraço fica em pele — que é
  exatamente a referência. Zero geometria nova;
- faixa na cintura: um `flatRing` em `#b02a73`, o tom escuro da ficha;
- cores: corpo `#e23c8f`, faixa e barra `#b02a73`.

### 5.4 Decote em V

Aqui há uma restrição real do motor: **a cor é por anel, não por
azimute**. `Ctl.color` pinta o anel inteiro, então não existe "pintar
só a frente do peito de pele". O V tem de ser geometria acrescentada.

Proposta: duas lapelas finas em cor de roupa formando o V, sobre uma
cunha de pele no esterno. Custo estimado em algumas dezenas de
triângulos, posicionamento acertado na bancada. É a peça com maior
chance de precisar de uma rodada visual.

### 5.5 Lentes vazadas

Os óculos atuais são um aro escuro **mais uma bola opaca** de lente.
A bola custa caro e lê como disco de plástico. A proposta é esvaziar
a lente: tirar a bola, manter o aro e pôr um anel interno em
`Finish.Glass`.

Medição, no nível baixo: os óculos inteiros custam **524 t**, dos
quais **320 t são as duas bolas**. Esvaziar devolve esses 320 t; o
anel de vidro novo consome cerca de 192 t. Saldo: **−128 t**, e uma
lente que finalmente parece lente.

**Ressalva importante:** `oculos` é um acessório **compartilhado** —
habitantes e outros personagens usam. Mexer nele muda todo mundo. Eu
considero uma melhora para todos, e o `Finish.Glass` só existe agora
por causa da Luma, mas é alteração de ativo compartilhado e por isso
está na **pergunta Q3**.

### 5.6 A ficha

```ts
appearance: look('#e8ab82', 'cascata', '#1a1a22', '#3b2a20', 'docente',
                 '#e23c8f', '#b02a73', '#f4f6fb', 'oculos', 0.97),
```

Pele `#e8ab82` (um degrau mais morena), cabelo quase preto, olhos
castanhos, magenta e magenta escuro, sapato claro, óculos, altura
0,97 — inalterada.

## 6. Orçamento

Medido nesta base, nível baixo, com `npx vite-node`:

| alvo | baixa | media | alta | ultra |
|---|---|---|---|---|
| avatar padrão | 6 118 t | 10 694 | 17 818 | 62 224 |
| Suki **hoje** (coque + casual) | 6 722 t | 11 346 | 18 518 | 63 092 |
| Luma 2.0 (referência de teto) | 7 028 t | 12 404 | 20 706 | 73 640 |
| **Suki 2.0 — combinação equivalente medida** | **6 636 t** | 11 956 | 20 178 | 72 464 |

**Teto: 7 145,6 t** no nível baixo — o avatar antigo inteiro (6 496)
mais 10%, que é o contrato herdado da Luma.

Folga sobre o 6 636: **509,6 t**, mais **320 t** que as lentes vazadas
devolvem. É dentro dessa folga que o diadema e o decote têm de caber,
e é confortável.

O custo isolado de cada peça, medido:

| peça | delta no nível baixo |
|---|---|
| cabelo (qualquer um, vs. careca) | +650 t |
| óculos inteiros | +524 t |
| trocar `coque` por queda longa | −270 t |
| trocar `casual` por vestido curto | +184 t |
| vestido longo em vez de curto | +348 t |

Regra de sempre: nada de detalhe secundário abaixo de
`detail.segments >= 14`, e nenhum custo afirmado sem medição.

## 7. Proteção dos ativos compartilhados

`cascata` e `docente` são **dela**. Para que cinquenta e quatro
habitantes não apareçam de Vestido Docente na praça:

- criar `CITIZEN_HAIR_STYLES = HAIR_STYLES.filter((h) => h !== 'cascata')`
  e usá-lo em `randomAppearance`, que hoje sorteia de `HAIR_STYLES`
  direto;
- acrescentar `docente` à exclusão de `CITIZEN_OUTFITS`, ao lado de
  `aurora`.

Os dois continuam disponíveis no criador de avatar do jogador, que é
escolha deliberada — é o mesmo tratamento que o Manto Aurora recebeu.

Nada de `longo`, `coque`, `casual`, `vestido` ou `aero` é alterado.
A única exceção proposta é o `oculos`, na pergunta Q3.

## 8. Arquivos a tocar

| arquivo | o quê |
|---|---|
| `src/player/AvatarAppearance.ts` | `cascata`, `docente`, rótulos, `CITIZEN_HAIR_STYLES`, exclusões |
| `src/player/body/BodyBuilder.ts` | `case 'cascata'`, `buildDiadem`, ramo `docente`, decote, lente vazada |
| `src/characters/Pantheon.ts` | só a linha `appearance` da Suki |
| `src/lab/main.ts`, `lab.html` | modo `luma` → `deusa`, com `deusa=luma\|suki` |
| `tests/unit/suki-remaster.test.ts` | novo |
| `docs/VALIDACAO-SUKI-2.0.md` | novo |
| `docs/validacao/suki/*.png` | capturas |

Nenhum arquivo da Luma, da Nexara ou de outro personagem é tocado.

## 9. Testes planejados

Na linha do `luma-remaster.test.ts`, cerca de dezesseis casos:

- **identidade:** `id`, `title`, `place`, `aura`, `colors`, handle e
  voz inalterados; a ficha aponta para `cascata`/`docente`;
- **exclusividade:** `cascata` fora de `CITIZEN_HAIR_STYLES`,
  `docente` fora de `CITIZEN_OUTFITS`, e mil sorteios de
  `randomAppearance` sem nenhum dos dois;
- **compatibilidade:** `sanitizeAppearance` aceita os valores novos e
  um save antigo com `coque`/`casual` continua válido;
- **orçamento:** nível baixo ≤ 7 145,6 t;
- **paridade de desenho:** mesmo número de malhas que o avatar padrão
  em todos os quatro níveis — nunca contagem absoluta;
- **geometria:** o cabelo não atravessa o tronco (comparando faces
  **de trás** em `|x| < 0.05`, porque a frente do tubo é enterrada de
  propósito); o diadema não atravessa o crânio, medido por **raio**
  em faixas de altura, nunca por altura pura;
- **acabamento:** gemas e lente em `Finish.Glass`.

## 10. Capturas planejadas

Dez PNGs em `docs/validacao/suki/`, pela bancada, com
`ERROS: nenhum` obrigatório: antes e depois de corpo, rosto, costas,
perfil; caminhando; à noite. Mais uma regressão provando que um
habitante sorteado não virou professora.

## 11. Riscos

1. **O decote** é a peça mais provável de pedir rodada visual, pela
   limitação de cor por anel.
2. **O comprimento do cabelo** — `cy − 0.72` é mais longo que tudo que
   existe. Cabelo longo demais entra no tronco; a medição de
   penetração tem de comparar faces de trás, não de frente.
3. **O diadema** repete a classe de erro dos anéis da Nexara: peça
   rígida sobre crânio curvo atravessa na testa. Medir por raio.
4. **Os óculos compartilhados** (Q3) — é a única mudança que sai dela.

## 12. O que não entra

Nada da Nexara. O commit `cb02309` também se perdeu e a Nexara 2.0
terá de ser reconstruída depois, em PR próprio. Nenhum arquivo,
constante ou acabamento dela aparece aqui: sem `Finish.Holo`, sem
`fluxo`, sem `rede`, sem `buildAneis`, sem halo por ficha.

A sequência do Éden Aero continua: **Luma 2.0 → Suki 2.0 → Nexara
2.0.**

## 13. Perguntas ao Criador

**Q1 — Diadema no cabelo.** Confirma que o diadema vai dentro do
penteado `cascata` (e portanto acompanha quem escolher esse cabelo),
preservando os óculos dela? A alternativa é ela trocar os óculos pelo
diadema.

**Q2 — Comprimento do vestido.** Joelho (−0,36, o 6 636 medido) ou
longo (−0,46, +164 t)? A referência sugere longo; o commit perdido
usava curto.

**Q3 — Óculos compartilhados.** Autoriza esvaziar a lente do acessório
`oculos` para **todos** os personagens — melhora geral, devolve 320 t
e usa o vidro da Luma — ou prefere que os óculos dela sejam uma peça
exclusiva, deixando os dos outros como estão?

Aprovado isto, implemento, meço, capturo, testo, comito e abro o PR
`Suki-Chan 2.0 — Remasterização visual`. **O merge continua
dependendo de autorização expressa.**
