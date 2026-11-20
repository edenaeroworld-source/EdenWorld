# BET Geometry Remaster 2.0 — validação

AfterBust® e AfterCurve® deixaram de ser escala radial de anéis e passaram
a ser um **campo de deslocamento volumétrico** aplicado à malha que já
existe. Nenhuma esfera foi colada no personagem, nenhum objeto é escalado,
nenhuma malha nova é criada.

Tudo aqui foi medido nesta máquina, em WebGL 2.0 real (`ANGLE / SwiftShader`,
perfis `baixa·media·alta·ultra`), com o `Environment` do jogo. Onde um número
não foi medido, está dito que não foi.

---

## 1. Como funciona

`src/afters/AftersMorph.ts` é a única fonte da matemática. O mesmo arquivo
emite o GLSL, então CPU e GPU não podem divergir — há teste de paridade.

O campo tem duas partes, somadas, ambas avaliadas **na posição original** do
vértice (nunca em cascata, senão a ordem de aplicação mudaria o resultado):

| parte | o que faz |
|---|---|
| **banda** | sustentação suave ao longo de `y`, com sigma de subida e de descida diferentes |
| **lobo** | um par espelhado de gaussianas 3D ancoradas, uma por lado |

O lobo é o que dá volume orgânico: `exp(−(dx/fx)² − qy² − (dz/fz)²)`,
deslocando o vértice ao longo de `normalize(pos − âncora)`. A âncora é o que
faz o volume *nascer do corpo* em vez de inchar para fora — é por isso que
aparece sulco entre os dois lobos e não um barril.

Zonas (atributo `aZone`, por vértice): `0` nenhuma · `1` busto · `2` quadril ·
`3` coxa · `4` braço.

### A zona do braço

O braço **não engorda**. Ele sai do caminho.

Um corpo mais largo afasta os braços; se o braço ficar parado, o tecido do
quadril atravessa a mão. A folga é calculada a partir do quanto o próprio
quadril alargou naquela altura — não é uma constante escolhida a olho:

```
folga = meia_largura_de_referência × ganho_da_banda(y) × rampa(y)
rampa = smoothstep(ombro 0.43 → cotovelo 0.16)
```

A rampa vale **exatamente zero** do ombro para cima. O braço é uma ilha de
malha que encosta no tronco sem costurar nele: 8 mm de deslocamento no
deltoide já abririam vão visível — isso foi medido e corrigido durante o
trabalho. É translação pura, sem girar normal e sem mudar `y` nem `z`.

Afastamento medido (mm), corpo padrão:

| altura | 100% | 250% |
|---|---|---|
| ombro `0.43` | 0.0 | 0.0 |
| cotovelo `0.16` | 0.0 | ~0.1 |
| quadril `0.00` | 30.6 | 76.6 |
| punho `−0.07` | 36.7 | 91.7 |

---

## 2. Roupa

Roupa e corpo são **uma malha fundida** que compartilha `aZone`. O tecido não
é deformado por um sistema à parte: ele é deformado porque *é* a mesma
superfície. Não há escala de objeto em lugar nenhum.

Custo: **dois floats uniformes por avatar por quadro**. Sem rebuild de
geometria, sem troca de material, sem draw call novo.

---

## 3. Continuidade, simetria e identidade — o que os testes garantem

`tests/unit/bet-geometria.test.ts` (34 testes) e `tests/unit/afters-body.test.ts`
(57 testes). Os que importam:

- **Dois lobos, não um barril** — a linha dos mamilos avança >1,15× o esterno.
- **Simetria bilateral** exata até a 12ª casa decimal, nos dois canais e no braço.
- **Continuidade por bissecção de passo**: ao dividir o passo pela metade, a
  diferença cai na razão 0,4–0,6. Uma descontinuidade não encolhe com o passo —
  limiar fixo não detectaria isso.
- **O campo morre antes da borda da zona**, então não há degrau entre zonas.
- **Identidade bit-exata em 0%**, nos quatro níveis: quem não usa BET não é tocado.
- **Zero triângulos invertidos** em mais de 1 000 avaliados sobre a malha real.
- **Costura**: vértices coincidentes continuam coincidentes depois da deformação
  completa — abertura **< 0,5 mm**.
- **Paridade TS↔GLSL** das constantes e da fórmula do lobo.

### Curvatura da superfície — número honesto

O maior giro de normal por passo de 4 mm é **0,179 rad a 100%** e **0,284 a 250%**,
sempre no **centro do lobo**. Isolando os campos: banda sozinha 0,016, lobo
sozinho 0,175.

Isso **não é vinco**: é a curvatura de ápice de uma gaussiana (2A/σ² ≈ 27 m⁻¹,
cerca de 6° por 4 mm) — ou seja, é exatamente o volume pedido. Tentei suavizar a
assimetria vertical do lobo achando que era a causa; medi de novo e **não era**.
A suavização ficou porque está correta, mas o relatório registra que ela não
resolveu nada. Os limites do teste (0,25 / 0,45) estão escritos com a medição ao
lado.

---

## 4. Desempenho

`niveis`, quatro níveis simultâneos, mesma cena, BET desligado e no máximo:

| nível | vértices @ 0% | vértices @ 250% |
|---|---|---|
| baixa | 3 383 | **3 383** |
| media | 5 873 | **5 873** |
| alta | 9 873 | **9 873** |
| ultra | 34 532 | **34 532** |

**A contagem não muda** — a deformação não cria geometria. FPS 36 → 38 (a
diferença é ruído; sob SwiftShader a cena é limitada por preenchimento).
O orçamento da `baixa` continua respeitado: o teste que o protege
(`personagens-organicos`) está verde.

---

## 5. Capturas — `docs/validacao/bet/`

| arquivo | o que mostra |
|---|---|
| `estados.png` | original · só AfterBust · só AfterCurve · os dois juntos |
| `rampa.png` | 0 → 62,5 → 125 → 187,5 → 250%, progressão suave |
| `niveis.png` | os quatro níveis com os dois canais em 250% |
| `costas.png` | quadril de costas em 250% |
| `ombro.png` | peito, axila e mãos de perto em 250% |
| `andando.png` | em movimento, ciclo de caminhada, 250% |
| `roupas-casual.png`, `roupas-esportivo.png` | outras roupas em 250% |

Todas saíram com `ERROS: nenhum` — a ferramenta de captura falha de propósito
quando a página registra erro, porque um PNG de shader quebrado se parece com
um PNG bom.

---

## 6. O que **não** está resolvido

**1. O antebraço raspa a saia (parcialmente resolvido).**
Medido, espaço de objeto, `ultra`, vestido, pior altura:

| situação | invasão mão/tecido |
|---|---|
| BET desligado (herdado do Character 2.0) | **−78 mm** |
| 250% **sem** a folga de braço | **−142 mm** |
| 250% **com** a folga de braço | **−90 mm** |

A folga devolveu **52 dos 64 mm** que o BET acrescentava (81%). Os 78 mm
restantes **são anteriores ao BET** e aparecem com os dois canais em 0%: a saia
é mais larga do que a linha em que os braços pendem. Em 250% sobra um retalho
de pele visível no quadril direito — sondado por projeção, é o antebraço em
`y −0,095…−0,022`, `x 0,254…0,306`, com o tecido em ~0,290: ele emerge cerca de
16 mm.

Não empurrei o braço mais para fora para esconder isso. Seria disfarçar uma
interseção herdada às custas de uma pose errada, e o número honesto é o de
cima: o BET hoje contribui com 12 mm dos 90 mm.

**2. `tests/unit/coracao-roseiral.test.ts` falha — e não é deste trabalho.**
Reproduzi a falha **com as minhas mudanças guardadas** (`git stash`), na árvore
base: falha igual, três execuções seguidas, sem variação. É um defeito
pré-existente no `main`, não instabilidade. Não mexi nele porque está fora do
escopo do BET.

**3. A calça facetada em 250%.** Em `roupas-casual.png` o quadril da calça mostra
facetas: a peça tem poucos anéis naquela altura. O campo está correto; a malha
da roupa é que é grossa ali.

**4. Não medido:** FPS em GPU real (aqui só há SwiftShader), e o comportamento
com os seis gestos faciais, que continuam intocados.

---

## 7. Portão

```
npx tsc --noEmit   → limpo
npx vitest run     → 1 080 passando · 11 pulados · 1 falhando (o pré-existente acima)
npm run build      → ok em 599 ms · index 730,73 kB (241,40 kB gz)
```
