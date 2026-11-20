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
`3` coxa. **Não há zona de braço** — ver abaixo.

### O braço — correção do PR #25

**O que eu tinha feito, e por que estava errado.** Para impedir que a saia
atravessasse a mão, eu deslocava o vértice do braço lateralmente em função da
altura dele. Isso não é mover um membro: é cisalhá-lo. Medido, com o quadril
em 250%:

| altura | x em 0% | x em 250% | deslocamento |
|---|---|---|---|
| ombro `0.43` | 0.187 | 0.187 | 0 mm |
| cotovelo `0.16` | 0.200 | 0.200 | **0 mm** |
| quadril `0.00` | 0.200 | 0.283 | 83 mm |
| punho `−0.07` | 0.200 | 0.291 | **92 mm** |
| dedos `−0.22` | 0.200 | 0.255 | **55 mm** ← volta atrás |

Cotovelo parado, punho 92 mm para fora e dedos voltando para 55 mm: um **S** no
antebraço, com **55 mm** de mudança nas distâncias internas do braço. É
exatamente o arqueamento que aparecia nas capturas.

**A causa-raiz, que só apareceu ao olhar o esqueleto.** O projeto **já tinha** o
mecanismo certo para isso, em `Avatar.updateRig()`, descrito lá como
*"deslocamento de junta, não deformação"*: a junta do ombro se afasta conforme
o AfterBust® (`SHOULDER_SPREAD = 0.034`, ou 85 mm em 250%), e a da perna
conforme o AfterCurve® (`LEG_SPREAD`). Minha compensação no shader estava
**duplicando** esse trabalho — e, pior, duplicando de um jeito que entorta.

O buraco real era outro: **o AfterCurve® não estava ligado ao ombro**. O quadril
alargava e o braço não saía do caminho.

**A correção.** Removi inteiramente a zona de braço do campo de deformação — o
shader não toca mais em nenhum vértice de braço — e liguei o AfterCurve® ao
mesmo deslocamento de junta que o AfterBust® já usava:

```ts
const volume = Math.max(bust * SHOULDER_SPREAD, curve * CURVE_SHOULDER_SPREAD);
```

É `max`, não soma: o braço precisa contornar o **mais largo** dos dois volumes,
não a soma deles — somar é o que põe o personagem em cruz quando as duas
intensidades sobem juntas.

**Resultado medido** (vestido, `ultra`, com skinning real):

| busto | quadril | x máx do braço | invasão mão/tecido |
|---|---|---|---|
| 0% | 0% | 0.266 | −78 mm *(herdado do Character 2.0)* |
| 250% | 0% | 0.351 | **+7 mm (livre)** |
| 0% | 250% | 0.351 | **−57 mm** *(era −142 mm)* |
| 250% | 250% | 0.351 | **−57 mm** |

E a anatomia, que é o ponto:

| | membro (úmero → dedos) | deltoide |
|---|---|---|
| busto 250% *(comportamento que já existia)* | **0,000 mm** | 74,2 mm |
| quadril 250% *(caminho novo)* | **0,000 mm** | 74,3 mm |
| ambos 250% | **0,000 mm** | 74,3 mm |

O membro é **rigorosamente rígido**: 4 972 vértices, nenhuma distância interna
muda. Cotovelo, antebraço e mão mantêm forma, tamanho e orientação. A única
parte que cede são os 264 vértices do deltoide, que se misturam ao tronco pelos
pesos de skinning — e cedem **o mesmo tanto que já cediam** pelo caminho do
busto, que é comportamento de produção desde antes deste trabalho.

**Esqueleto × shader.** Os 19 ossos ficam **exatamente onde estavam** quando os
uniformes `uBust`/`uCurve` mudam: o campo de deformação é só shader. Quem move
o braço é o reposicionamento de junta, que é rígido por construção.

### O ombro — segunda correção

A correção acima consertou o membro, mas deixou um defeito na junção do ombro:
o braço **descolava do tronco**. Medido, sobreposição braço↔tronco (positivo =
encaixado, negativo = fenda):

| altura | 0% | busto 250% | quadril 250% |
|---|---|---|---|
| 0.40 | +45 mm | −3 mm | −6 mm |
| 0.35 | +41 mm | **−34 mm** | **−44 mm** |
| 0.30 | +14 mm | **−44 mm** | **−71 mm** |
| 0.25 | +6 mm | −57 mm | −79 mm |

**Causa-raiz: uma constante calibrada para a matemática antiga.**
`SHOULDER_SPREAD = 0.034` recuava a junta 85 mm em 250%. Esse número batia com
o BET antigo, cuja banda de busto abria o peito em `gainX 0.2` (79 mm em 250%).
Na reescrita o volume passou a vir dos lobos e a banda caiu para `gainX 0.055`
— o peito passou a crescer ~22 mm, mas a junta continuou recuando 85 mm. O
braço saía quatro vezes mais do que o corpo engordava.

**Correção.** O recuo da junta deixou de ser constante e passa a ser **medido no
próprio campo**: pergunta-se ao AfterBust® quanto ele desloca a superfície do
tronco na altura da axila, e a junta recua exatamente isso. Se alguém retunar o
campo amanhã, o rig acompanha sozinho.

O AfterCurve® foi **desligado do ombro**: ele não alarga o corpo na altura da
axila, então mover a junta por causa dele só abria fenda.

| altura | 0% | busto 250% | quadril 250% | ambos 250% |
|---|---|---|---|---|
| 0.40 | +45 | **+36** | +45 | **+36** |
| 0.35 | +41 | **+29** | +41 | **+29** |
| 0.30 | +14 | **+20** | +14 | **+20** |
| 0.25 | +6 | **+6** | +6 | **+6** |

O braço fica encaixado em toda a progressão. E o deltoide, que esticava 74 mm,
agora estica **18,8 mm** com o busto e **0,000 mm** com o quadril.

**A rigidez do membro foi preservada:** 4 972 vértices, **0,000 mm** de mudança
em qualquer combinação de intensidade. Sem S no antebraço, sem cotovelo
deslocado, punho e mão alinhados.

## 2. Roupa

Roupa e corpo são **uma malha fundida** que compartilha `aZone`. O tecido não
é deformado por um sistema à parte: ele é deformado porque *é* a mesma
superfície. Não há escala de objeto em lugar nenhum.

Custo: **dois floats uniformes por avatar por quadro**. Sem rebuild de
geometria, sem troca de material, sem draw call novo.

---

## 3. Continuidade, simetria e identidade — o que os testes garantem

`tests/unit/bet-geometria.test.ts` (31 testes) e `tests/unit/afters-body.test.ts`
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
- **O braço é rígido**: nenhuma distância interna do membro muda em nenhuma
  combinação de intensidade (tolerância 1e−6 m). Este teste é o que impede o
  defeito do antebraço em S de voltar.
- **O campo não toca no braço**: `aZone` só contém 0, 1, 2 e 3.
- **Busto e quadril não somam** no ombro, e o ombro volta exatamente ao lugar
  quando o BET desliga.

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
| `matriz.png` | a matriz de intensidade: 0 · 25 · 50 · 75 · 100 · 150 · 200 · 250% |
| `estados.png` | original · só AfterBust® · só AfterCurve® · os dois juntos |
| `isolado-busto.png` | AfterBust® 250% com AfterCurve® em 0 |
| `isolado-curva.png` | AfterCurve® 250% com AfterBust® em 0 |
| `ombro.png` | ombro e axila de perto, ambos em 250% |
| `ombro-zero.png`, `ombro-busto.png`, `ombro-curva.png` | a mesma junção em 0%, só busto 250% e só quadril 250% |
| `ombro-esportivo.png` | a junção com roupa esportiva, ambos em 250% |
| `niveis.png` | os quatro níveis de qualidade, ambos em 250% |
| `costas.png` | quadril de costas, AfterCurve® 250% |
| `andando.png` | em movimento, ciclo de caminhada, ambos em 250% |
| `roupas-casual.png`, `roupas-esportivo.png` | outras roupas, ambos em 250% |

Todas saíram com `ERROS: nenhum` — a ferramenta de captura falha de propósito
quando a página registra erro, porque um PNG de shader quebrado se parece com
um PNG bom.

---

## 6. O que **não** está resolvido

**1. A saia engole a mão — e piorou com a correção do ombro.** Este é o
compromisso que a correção do ombro impôs, e está aqui sem maquiagem:

| | invasão mão/tecido |
|---|---|
| BET desligado | −78 mm *(herdado do Character 2.0)* |
| AfterBust® 250% | −56 mm |
| AfterCurve® 250% | **−142 mm** |
| ambos 250% | **−120 mm** |

Antes desta correção, o quadril em 250% marcava −57 mm, porque a junta do ombro
recuava 85 mm — e era justamente esse recuo exagerado que descolava o braço do
tronco. Escolhi o ombro correto em vez do número bonito na roupa.

Os −78 mm de base existem com o BET desligado: a saia é mais larga do que a
linha em que os braços pendem.

**O caminho para resolver, se você autorizar:** girar o osso do braço
(abdução) em vez de transladar a junta. Giro pivota no ombro, então não abre
fenda nenhuma ali, e tira a mão do tecido. Não fiz porque muda a pose do
esqueleto e sua instrução foi não mexer nisso sem demonstrar necessidade —
estes números são a demonstração; a decisão é sua.

**2. Na caminhada, aparece um retalho de pele sobre a saia em 250%.**
Visível em `andando.png`. Sondando por osso os vértices daquele pedaço da tela,
há antebraço (266), coxa (177) e saia misturados ali. Tentei quantificar com um
critério radial na pose congelada e ele devolveu **zero nos dois casos (0% e
250%)**, o que não bate com a imagem: **a medição está errada, não o defeito**.
Fica registrado como defeito aberto e **não quantificado**. A saia é rígida,
presa ao quadril, e não simula — membros em balanço a atravessam.

**3. A calça facetada em 250%.** Em `roupas-casual.png` o quadril da calça
mostra facetas: a peça tem poucos anéis naquela altura. O campo está correto; a
malha da roupa é que é grossa ali.

**4. O deltoide estica 18,8 mm em 250% de busto.** Caiu de 74 mm com a correção
do ombro. É o custo do reposicionamento de junta e está dentro do que os pesos
de skinning absorvem sem artefato visível.

**5. `tests/unit/coracao-roseiral.test.ts` falha — e não é deste trabalho.**
Reproduzi a falha **com as minhas mudanças guardadas** (`git stash`), na árvore
base: falha igual, três execuções seguidas, sem variação. É defeito
pré-existente no `main`. Não mexi nele e não o mascarei.

**6. Não medido:** FPS em GPU real (aqui só há SwiftShader) e os seis gestos
faciais, que continuam intocados.

## 7. Portão

```
npx tsc --noEmit   → limpo
npx vitest run     → 1 077 passando · 11 pulados · 1 falhando (o pré-existente acima)
npm run build      → ok em 627 ms
```
