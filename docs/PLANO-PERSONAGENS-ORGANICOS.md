# Marco N — Modelagem orgânica, volumes corporais e animação

> *"Não queremos mais personagens com aparência de bonecos quadrados
> da era PlayStation 1."*

Este documento registra o que o Marco N mudou no corpo dos
personagens do Éden, por que a mudança teve de ser **na geometria** e
não na iluminação, e o que ficou de fora.

---

## 1. A auditoria

Antes de mexer, medimos. Um teste descartável instrumentou o avatar e
reportou o que o jogo realmente desenhava:

| | antes |
|---|---|
| malhas por avatar | **13** |
| triângulos | 6 496 |
| vértices | **18 405** |
| chamadas de desenho | 12 |
| geometria indexada | não (só o cabelo) |

Dezoito mil vértices para seis mil triângulos é o sintoma. A razão
saudável fica perto de 1 vértice por 2 triângulos; aqui era **3
vértices por triângulo** — ou seja, nenhum vértice era compartilhado
entre faces vizinhas.

A causa estava em duas linhas do construtor antigo:

```ts
PartBuilder.add(geometry) → geometry.toNonIndexed()
mergeGeometries(parts, /* useGroups */ false)
```

`toNonIndexed()` desmonta o índice e duplica cada vértice por face.
Depois disso, `computeVertexNormals()` não tem como calcular a média
de uma normal entre duas faces, porque para ele não existe "o mesmo
vértice em duas faces" — existem dois vértices distintos no mesmo
lugar. **Toda** aresta virava uma quina dura.

O segundo problema era topológico. Um membro era:

```
cilindro aberto  +  esfera colada na ponta  +  esfera colada na outra ponta
```

Três objetos independentes ocupando o mesmo espaço. Não havia
continuidade de superfície entre o braço e o ombro, entre a coxa e o
quadril, entre o pescoço e o tronco — havia interpenetração. E como
cada peça era filha de um osso diferente, dobrar o cotovelo separava
as duas metades: a silhueta abria uma fenda e a esfera do meio ficava
exposta. É exatamente a dobradiça de boneco articulado.

**Conclusão da auditoria:** o problema não era material, nem luz, nem
rig. Era a malha. Qualquer tentativa de resolver no shader seria
maquiagem.

### O que já funcionava e foi preservado

Vale listar, porque a instrução era explícita — *não reconstruir o que
já funciona*:

- o esqueleto e as posições das juntas (nomes, alturas, hierarquia);
- `AvatarAnimator` (425 linhas, 13 gestos, poses como `Float32Array`);
- `AvatarFace` e os seis morfos de expressão;
- `AftersMorph` / `Gestation` e suas bandas de deformação;
- `CharacterModels` como fonte única dos modelos oficiais;
- `SaveSystem`, `CitizenSim`, `NpcLife`, diálogo, colisão.

Nada disso foi reescrito. O Marco N trocou **o que é desenhado**,
mantendo intacto **o que o move**.

---

## 2. A arquitetura nova

Três módulos novos em `src/player/body/`, mais a reescrita de
`Avatar.ts`.

### `BodySurface.ts` — a superfície

Um construtor de malha por *lofting*: descreve-se o corpo como uma
sequência de **estações** (anéis de seção transversal) e a superfície
é varrida entre elas.

```ts
interface Station {
  y: number;           // altura no espaço de bind
  rx: number;          // meio-eixo lateral
  rz: number;          // meio-eixo frontal
  rzBack?: number;     // meio-eixo traseiro — a seção é um ovo, não um círculo
  x?: number; z?: number;
  color: Hex;
  skin: SkinBinding;   // osso, e opcionalmente um segundo osso + mistura
  zone?: MorphZone;
  origin?: [number, number, number];
}
```

Três decisões fazem a diferença entre isto e um cilindro:

1. **A malha é indexada.** Os anéis compartilham vértices, então
   `computeVertexNormals()` tem o que fazer a média — a superfície
   acende lisa. Não há `toNonIndexed()` em lugar nenhum do caminho.
2. **`subdivideProfile` interpola com Hermite.** As estações são
   pontos de controle, não a malha final: entre duas estações
   escritas à mão entram mais anéis, com tangentes contínuas. É a
   "subdivisão ou equivalente" do requisito — o perfil de um membro
   vira uma curva, não um tronco de cone.
3. **A seção é assimétrica** (`rzBack`). Uma panturrilha tem a barriga
   atrás; um glúteo não é um semicírculo; o peito do pé não é igual ao
   calcanhar. Com um raio só, nada disso existe.

O mesmo construtor oferece `feature()` — um empurrão gaussiano local,
usado para o deltoide, o maxilar e as órbitas (com amplitude negativa,
para **cavar**). Volume feito deslocando a própria superfície, e não
colando uma esfera por cima: é o que o requisito 2 pede quando diz
*"parte da geometria integrada"*.

### `BodyRig.ts` — as medidas e os níveis de detalhe

Mantém os onze ossos e as medidas canônicas (`THIGH .41`, `SHIN .385`,
`UPPER_ARM .27`, `FOREARM .23`, …) e acrescenta os três níveis de
malha:

| nível | lados do anel | subdivisões | lados da cabeça |
|---|---|---|---|
| `alta` | 20 | 4 | 14 |
| `media` | 14 | 3 | 11 |
| `baixa` | 10 | 2 | 8 |

### `BodyProportions.ts` — a personalização

Onze campos (`height`, `build`, `shoulders`, `chest`, `waist`, `hips`,
`armLength`, `legLength`, `neck`, `headSize`, `faceShape`), cada um com
faixa declarada e *fallback* individual em `sanitizeProportions`.

`proportionsFor(id, height)` deriva um corpo do **id** por FNV-1a. O
mesmo id devolve sempre o mesmo corpo — nesta sessão, na próxima, em
Aurora e em Rosas — sem guardar nada no save. É o que permite dar
porte próprio a cada morador da praça sem inventar um campo novo em
disco e sem que ninguém mude de ombros ao cruzar um portal.

### `BodyBuilder.ts` — o corpo

Monta tudo numa geometria só: tronco (com peito, cintura, quadril e
glúteo no mesmo *loft*), saia quando a roupa pede, braços, pernas,
cabeça com órbitas cavadas e olhos assentados dentro delas, cabelo e
acessório.

### `Avatar.ts` — de 13 peças rígidas a uma pele

```
root → scaler(height) → pivot(0.845) → SkinnedMesh 'corpo'  (+ 'rosto', + halo)
```

Uma `SkinnedMesh` sobre os onze ossos de sempre. O esqueleto é
reconstruído junto com a malha, porque as proporções mudam o
comprimento dos ossos — malha e esqueleto nunca ficam dessincronizados.
O `bind()` acontece **fora da cena**, para que a matriz de bind seja a
identidade.

#### O problema do espaço de bind, e como foi resolvido

As deformações existentes (`AftersMorph`, `Gestation`) foram escritas
quando cada parte do corpo era um objeto com origem na própria junta:
as bandas medem altura em `y` **local da junta**. Com um corpo único, o
`y` de um vértice passou a ser medido do quadril — e todas as bandas
apontariam para o lugar errado.

A saída foi não tocar nas bandas. Cada vértice carrega um atributo
novo, `aMorphOrigin`, com a origem da junta a que pertence, e o shader
faz a volta:

```glsl
vec3 edenBodyPosition(vec3 p) {
  vec3 local = p - aMorphOrigin;
  local = edenGestationPosition(edenAftersPosition(local));
  return local + aMorphOrigin;
}
```

A conta das bandas continua idêntica, byte por byte. A injeção entra
**antes** de `skinning_vertex`, então a deformação acontece no espaço
de bind e o volume continua correto com os membros posados. O mesmo
bloco vai no `MeshDepthMaterial`, para que a sombra siga a silhueta.

---

## 3. Articulações que dobram como carne

A parte que mais importa para o veredito *"não parece PlayStation 1"*.

Numa junta, as estações declaram **dois** ossos e a fração de peso
entre eles. O cotovelo tem cinco anéis de rampa (`0 → .18 → .5 → .82 →
1`), o joelho também. A mistura é feita por mapa osso→peso, somando
termo a termo e ficando com os dois mais pesados — o que torna a
interpolação associativa e impede que o peso salte para trás na
fronteira entre um anel de dois ossos e um de um só. (A primeira
versão tinha esse salto; o resultado media 136° de virada máxima, pior
que a dobradiça que estava substituindo.)

Medição, com o cotovelo dobrado a 90°:

| | repouso | dobrado 90° |
|---|---|---|
| maior virada entre anéis vizinhos | **0,0°** | **17,9°** |
| anéis participando da curva | — | 10 |

Dezessete graus distribuídos por dez anéis é uma curva. Noventa graus
num anel só é uma dobradiça. Em repouso a linha do braço é reta até a
quinta casa decimal, o que confirma que a rampa não deforma o braço
parado.

No corpo inteiro, **5,8% dos vértices** (600) têm peso repartido entre
dois ossos. São exatamente as faixas de articulação.

---

## 4. O resultado medido

| | antes | depois (`alta`) |
|---|---|---|
| malhas | 13 | **3** |
| chamadas de desenho | 12 | **3** |
| triângulos | 6 496 | 16 944 |
| vértices | 18 405 | **11 427** |
| indexada | não | **sim** |
| normais médias entre peças | não | **sim** |

Vale ler as duas últimas linhas da tabela juntas: o corpo tem **2,6×
mais triângulos** e ao mesmo tempo **38% menos vértices**. É o que
significa deixar de duplicar vértice por face. O custo de vértice —
que é o que pesa num avatar com esqueleto, porque a transformação de
pele roda por vértice — **caiu**, e ainda assim a superfície ficou
muito mais densa.

Níveis de detalhe:

| nível | triângulos | vértices | altura do topo |
|---|---|---|---|
| `alta` | 16 944 | 11 427 | 1,735 |
| `media` | 10 648 | 7 613 | 1,735 |
| `baixa` | 6 744 | 5 277 | 1,735 |

A malha `baixa` tem **menos triângulos que o avatar antigo inteiro** e
a mesma silhueta — a altura do topo é idêntica nos três níveis, então
ninguém encolhe ao mudar de qualidade ou ao se afastar.

### LOD em funcionamento

`NpcSystem` escolhe a malha pela distância, usando o
`detailDistance` do perfil de qualidade: cheia até a linha, `media`
até o dobro, `baixa` além. A troca tem folga de 15% para fora da faixa
atual, para que ninguém parado em cima da linha reconstrua o corpo a
cada quadro. Nada é reconstruído por quadro — nem malha, nem material:
as deformações são todas de shader, com uniformes que vivem no
avatar.

---

## 5. Identidade entre regiões

`createOfficialAvatar()` continua sendo a fonte única, e agora aplica
também as proporções derivadas do id. `officialFingerprint()` passou a
incluir `proportionsFingerprint(...)`: se algum sistema reconstruir um
personagem por conta própria e errar o corpo, a impressão digital
muda e o teste de consistência entre regiões acusa.

Suki-Chan tem o mesmo corpo em Aurora City e em Rosas Park porque os
dois lugares pedem o modelo no mesmo lugar — não porque alguém se
lembrou de copiar os valores.

---

## 6. Prova visual

`tests/unit/personagens-render.test.ts` gera três folhas:

- `docs/personagens-marco-n.png` — Aérion, Suki-Chan, Saturno, Maze, um
  habitante comum e o corpo jogável, cada um de frente, de perfil, de
  costas e em três quartos;
- `docs/personagens-animacao.png` — parado, caminhando, correndo e
  conversando;
- `docs/personagens-articulacoes.png` — cotovelos e joelhos dobrados.

```
EDEN_RENDER=1 npx vitest run tests/unit/personagens-render.test.ts
```

O rasterizador (`tests/helpers/raster.ts`) aplica **a mesma conta do
shader, na mesma ordem** — deformação no espaço de bind, depois a
matriz de pele de cada osso — sobre a geometria real, com z-buffer. A
imagem mostra a malha que a GPU receberia.

### O que esta prova não é

**Não há navegador nem WebGL neste ambiente.** O requisito 10 pede
captura real em jogo e adverte explicitamente contra apresentar
imagens rasterizadas como prova de que o modelo final funciona. A
advertência está correta e é respeitada aqui: as folhas acima provam
**forma, proporção e deformação**, e nada além disso.

O que falta para o veredito final, e que só a tela pode dar:

- iluminação do cenário, mapa de sombras e tone mapping;
- reflexos e o acabamento Frutiger Aero sobre a pele;
- o comportamento do material em movimento real, com a câmera em
  terceira pessoa;
- desempenho medido em GPU de verdade, com multidão.

Recomendação: rodar `npm run dev`, usar `?debug` →
`__eden.irPara('suki')` e `?bench=60` → `__eden.medir(30)` numa
máquina com navegador, e comparar com a medição anterior ao marco.

---

## 7. Compatibilidade

| sistema | situação |
|---|---|
| `SaveSystem` | intacto. As proporções **não** são salvas: derivam do id. Saves antigos abrem sem migração. |
| `CharacterSystem` / `Pantheon` | ids preservados. |
| `NpcSystem` | proporções por habitante + LOD por distância. |
| `CitizenSim` / `NpcLife` | não tocados. |
| `AftersBodySystem` | uniformes preservados; a conta das bandas é idêntica. |
| `Gestation` | idem; Amara continua com `gestation: 1`. |
| `UniverseSystem` / `RegionManager` | não tocados. |
| colisão | não tocada — a cápsula do jogador é independente da malha. |
| diálogo | não tocado. |
| `getObjectByName('braco-e')` | **continua resolvendo** (é um osso, e os testes dependem disso). |

---

## 8. Limitações e o que não foi feito

Honestamente, o que ficou de fora:

1. **Nenhuma captura em jogo.** Impossível neste ambiente (item 6).
2. **Sem medição de desempenho em GPU real.** A comparação acima é de
   contagem de geometria, que é um bom indicador mas não substitui
   quadros por segundo medidos com multidão à vista.
3. **Mãos sem dedos.** A mão é uma pá com polegar. Dedos individuais
   custariam ossos novos no rig e uma reescrita do animador — fora do
   escopo deste marco.
4. **Sem dobras de roupa de verdade.** A roupa tem espessura e
   silhueta próprias (gola, bainha, cós, saia), mas não tem prega nem
   simulação. Seria trabalho de material, não de malha.
5. **Pele sem variação de tom dentro do mesmo corpo.** O requisito 7
   pede "variação natural de tom"; hoje há variação **entre**
   personagens (oito tons) e entre regiões do corpo (rubor nas
   bochechas), mas não um gradiente sutil ao longo da pele.
6. **A face continua sendo uma malha à parte.** Funciona — os morfos
   são dela, e o material é compartilhado — mas há uma emenda
   conceitual entre `rosto` e `corpo` que uma versão futura poderia
   unificar.
7. **`baixa` ainda tem 6 744 triângulos.** Para multidões muito
   grandes em telefone, valeria um quarto nível, ou *impostores*.

---

## 9. Arquivos

**Novos**

```
src/player/body/BodyProportions.ts
src/player/body/BodySurface.ts
src/player/body/BodyRig.ts
src/player/body/BodyBuilder.ts
tests/helpers/raster.ts
tests/unit/personagens-render.test.ts
tests/unit/personagens-organicos.test.ts
docs/PLANO-PERSONAGENS-ORGANICOS.md
```

**Modificados**

```
src/player/Avatar.ts              reescrito: SkinnedMesh + aMorphOrigin + setDetail
src/characters/CharacterModels.ts proporções oficiais na fonte única
src/npc/NpcSystem.ts              proporções por habitante + LOD geométrico
tests/unit/afters-body.test.ts    a asserção que contava as 13 malhas antigas
```
