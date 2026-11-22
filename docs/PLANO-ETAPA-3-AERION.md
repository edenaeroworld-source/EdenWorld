# Etapa 3 — Aérion 2.0: integração masculina e identidade cósmica

> **Estado:** plano fechado, **aguardando autorização para implementar**.
> Nada implementado.
> **Decisão de §3 tomada pelo autor: opção A — corpo cósmico integral.**
> **Decisão canônica recebida:** Aérion é masculino (`sex: 'masc'`).
> Deve manter a identidade de entidade cósmica — corpo formado por
> galáxias, nebulosas, estrelas, poeira cósmica e auroras.
> **Não** virar um personagem masculino genérico.
> **Referência visual:** `docs/referencia-aerion-cosmico.png`.

---

## 1. Diagnóstico — o que eu medi antes de propor

Tudo abaixo foi medido no código atual, não estimado.

### 1.1 A ficha e a malha discordam

A bio dele, escrita há muitos marcos, já diz:

> *"Seu corpo parece conter uma galáxia inteira — estrelas, nebulosas,
> poeira cósmica e luz de aurora."*

O que está implementado:

| campo | valor | natureza |
| --- | --- | --- |
| `skin` | `#2a2350` | roxo escuro — pele comum, cor incomum |
| `hairStyle` | `longo` | **genérico**, o mesmo de qualquer habitante |
| `outfit` | `aero` | **genérico**, o mesmo de qualquer habitante |
| `accessory` | `aureola` | o toro do `halo`, compartilhado |

**Aérion é o único dos onze sem uma só peça própria.** As dez deusas
têm penteado e traje exclusivos (`cascata`+`docente`, `copa`+`jardim`,
`pincelada`+`lumen`…). O criador do Éden usa roupa de passante pintada
de roxo.

### 1.2 Ele é o mais barato do panteão

Vértices por personagem, medidos nos quatro níveis:

| personagem | ultra | alta | media | baixa |
| --- | ---: | ---: | ---: | ---: |
| maze | 44 905 | 18 330 | 9 412 | 3 274 |
| lilly | 43 411 | 13 832 | 8 862 | 4 726 |
| amara | 43 408 | 14 189 | 8 055 | 3 857 |
| suki | 43 253 | 13 346 | 8 282 | 4 914 |
| akemi | 42 031 | 13 822 | 9 098 | **4 982** |
| … | | | | |
| **aerion** | **37 107** | **11 464** | **7 104** | 4 354 |

Ele é o **11º de 11** em custo. Folga até o teto do panteão:
**+7 798** em ultra, **+6 866** em alta, **+2 308** em media — e apenas
**+628** em `baixa`, onde ele já é um dos mais caros.

> **Esse 628 é a restrição que determina a arquitetura inteira deste
> plano.** Galáxia feita de bolinhas não cabe. A Etapa 2 já ensinou
> isso por via dolorosa: o `crespo` com anéis fixos estourou os níveis
> baixos e teve de ser refeito derivando densidade de `detail.segments`.

### 1.3 O corpo dele é um sorteio, não um desenho

`proportionsFor(id)` deriva as medidas de um **hash do texto** `'aerion'`.
Nenhum personagem do Éden tem proporções autorais. O que o hash deu:

```
         build should  chest  waist   hips
aerion    0.53   1.14   0.94   1.15   0.94
```

Ombros largos (1,14 — o maior do panteão) convivendo com **peito 0,94 e
cintura 1,15**. Resultado medido: **peito/cintura = 1,01**. Não é uma
silhueta masculina nem feminina — é um tubo.

### 1.4 `sex` ainda não chega à malha

Depois da Etapa 2, o campo faz três coisas: escolhe catálogo em
`makeCitizen`, corta os Afters em `rollCitizenAfters` e parte as listas
em `CITIZEN_*_BY_SEX`. **A malha, o rosto e o esqueleto não o leem.**
Trocar o campo do Aérion para `'masc'` hoje, sozinho, não muda um pixel.

### 1.5 O acabamento é dirigido por tabela — e isso é uma porta aberta

`BodyFinish.ts` tem sete tabelas de oito posições (rugosidade, metal,
sheen, verniz, ambiente, iridescência, emissão) e **gera o GLSL a partir
delas** via `pick()`. O próprio arquivo registra por que:

> *"acrescentar um acabamento exigia lembrar de mexer em cinco funções
> com aridade fixa"*

Acrescentar o **9º acabamento** é somar uma entrada em cada tabela. Os
oito existentes mantêm os valores ⇒ **zero mudança visual em todo o
resto do Éden, por construção.**

### 1.6 O material é por avatar

`this.material = this.buildMaterial(...)` roda no construtor de cada
`Avatar`; `customProgramCacheKey` faz o **programa** ser compilado uma
vez só e compartilhado, mas os **uniformes são por instância**. Dá para
acender um efeito só no Aérion sem tocar nos outros 64 corpos em cena.

### 1.7 A armadilha: peça nova nasce disponível para habitante

```ts
CITIZEN_HAIR_STYLES = HAIR_STYLES.filter(h => h !== 'cascata' && h !== 'fluxo' && …)
CITIZEN_OUTFITS     = OUTFITS.filter(o => o !== 'aurora' && o !== 'docente' && …)
```

São **listas de exclusão por nome**. Um penteado novo que não seja
nomeado ali entra no sorteio da cidade. É exatamente a classe de bug
que a Etapa 2 consertou — e os testes novos dela **não pegariam**, porque
eles comparam contra `CITIZEN_HAIR_STYLES`, que já conteria a peça.

### 1.8 Aérion é a testemunha de não-regressão de quatro marcos

Sete asserções fixam as peças genéricas dele:

| arquivo | linha | asserção |
| --- | ---: | --- |
| `amara-remaster.test.ts` | 322 | `hairStyle === 'longo'` |
| `amara-remaster.test.ts` | 404 | `outfit === 'aero'` ← cai com a decisão A |
| `haru-remaster.test.ts` | 261 | `outfit === 'aero'` ← cai com a decisão A |
| `haru-remaster.test.ts` | 262 | usa a ficha dele como "habitante" |
| `jupiter-remaster.test.ts` | 561 | `hairStyle === 'longo'` |
| `maze-remaster.test.ts` | 138 | `hairStyle === 'longo'` |
| `maze-remaster.test.ts` | 574 | `hairStyle === 'longo'` |

Elas existem para provar que o remaster de cada deusa **não encostou
nele**. Dar peças próprias ao Aérion as quebra — e tem de quebrar.

**Boa notícia medida:** `officialFingerprint` é usado de forma
*relacional* (auto-consistência e unicidade entre os onze), nunca contra
uma string fixa. Mudar o Aérion não quebra a impressão digital de
ninguém.

---

## 2. Arquitetura proposta

> **Princípio reitor: o cósmico é acabamento, não geometria.**
> Decorre direto do §1.2 — há 628 vértices de folga em `baixa`.
> Estrela que custa vértice não escala para 54 habitantes em cena.

Três camadas independentes, implementáveis e verificáveis em separado.

### C1 — A silhueta masculina chega ao corpo

```ts
bodyMetrics(p: BodyProportions, shape: BodyShape = SHAPE_FEM): BodyMetrics
```

- **Argumento com padrão.** As dez deusas e os 54 habitantes continuam
  chamando com um argumento e recebem exatamente as medidas de hoje —
  **intactas por construção**, não por teste. É a mesma tática que fez a
  Etapa 1 passar com 70/70 valores-ouro idênticos.
- `SHAPE_MASC` multiplica as **medidas derivadas**, não `BodyProportions`.
  Motivo: `BodyProportions` é hash-derivada e compartilhada com o save;
  mexer nela moveria `proportionsFingerprint`, que entra em
  `officialFingerprint`.
- Proposta inicial, a calibrar medindo: ombro ×1,06 · peito ×1,08 ·
  cintura ×0,92 · quadril ×0,93 · pescoço ×1,05.
- **Alvo:** peito/cintura de **1,01 → ≥ 1,20**. Um V discreto; o Éden
  não é um jogo de fisiculturismo.

### C2 — Peças próprias, no padrão das dez deusas

| peça | tipo | o que é |
| --- | --- | --- |
| `'cosmos'` | `HairStyle` | cabelo-nebulosa: fluxo de luz, não "cabelo masculino comprido" |
| `'criador'` | `Outfit` | o corpo-galáxia (ver §3) |
| `Finish.Cosmos` | 9º acabamento | emissão ~0,45 · rugosidade 0,15 · iridescência 1,0 |

Obrigações que o §1.7 impõe, **no mesmo commit**:

- marcar as duas peças como `'masc'` em `HAIR_AUDIENCE` / `OUTFIT_AUDIENCE`
  (os `Record` são totais ⇒ esquecer **não compila**);
- acrescentá-las às exclusões de `CITIZEN_HAIR_STYLES` / `CITIZEN_OUTFITS`;
- acrescentá-las à lista de peças de deusa em `cidade-mista.test.ts`.

### C3 — O céu dentro do corpo (custo: zero vértices)

Campo procedural no fragmento, ancorado na posição de **bind** (varying
`vBind`), para as estrelas não nadarem quando ele caminha:

1. **poeira cósmica** — ruído de baixa frequência, violeta → azul-noite;
2. **nebulosas** — duas manchas largas nas cores canônicas dele
   (`#b7a2ff`, `#4b2fa8`);
3. **estrelas** — pontos de alta frequência, cintilação lenta;
4. **aurora** — faixa que percorre o torso, no tempo já disponível.

Ligado por uniforme `uCosmos` (0 para todos os outros avatares) ⇒ ramo
uniforme, coerente na chamada de desenho, **custo nulo para os 54
habitantes e as 10 deusas**.

---

## 3. Decisão tomada: **A — corpo cósmico integral**

Escolhida pelo autor. O cosmos *é* o corpo: sem pano, como na
referência. O traje `criador` não é roupa — é a pele-galáxia.

### 3.1 Por que A sai quase de graça — medido

Aérion em `alta`, vértices por acabamento:

| acabamento | vértices | o que é |
| --- | ---: | --- |
| `Cloth` | **8 819** | **tronco + braços + pernas inteiros** |
| `Eye` | 992 | olhos |
| `Skin` | 971 | 870 cabeça/rosto + 101 pescoço |
| `Hair` | 682 | cabelo |

O corpo varrido **não** usa `Finish.Skin`: ele herda `b.surface`, que
`buildBodyGeometry` atribui em uma linha antes de varrer —
consequência direta do que a Etapa 2 descobriu (`subdivideProfile`
descarta o acabamento das estações).

```ts
b.surface = cloth;          // ← aqui
buildTorso(…); buildArm(…); buildLeg(…);
b.surface = Finish.Skin;
buildHead(…);
```

**Trocar esse `cloth` por `Finish.Cosmos` quando o traje for `criador`
torna 8 819 dos 11 464 vértices (77% do corpo) cósmicos de uma vez, sem
acrescentar um único vértice.** O aperto de `baixa` (§1.2) deixa de ser
risco: a camada C3 custa zero.

### 3.2 O que ainda precisa de tratamento próprio

| parte | vértices | tratamento |
| --- | ---: | --- |
| cabeça e rosto | 971 | na referência o rosto **é** cósmico — entra em `Finish.Cosmos`, com o pescoço fazendo a transição |
| olhos | 992 | brancos e acesos na referência; `Finish.Eye` já tem verniz 1,0 — ajuste de cor, não de malha |
| cabelo | 682 | vira `'cosmos'`: fluxo de luz, o único item de C2 que gasta vértice |

### 3.3 O que "nu" significa neste motor

Não há nada a inventar: os sinalizadores já existem e já são usados.
`bareTorso` nasceu na Etapa 2 para a bermuda de banho, e `bareArms` /
`bareLegs` são anteriores. O traje `criador` liga os três e não desenha
peça nenhuma — a figura fica lisa, como a referência mostra, porque o
corpo do Éden nunca teve detalhe anatômico para esconder.

---

## 4. Riscos

| | risco | mitigação |
| --- | --- | --- |
| **R1** | alterar as dez deusas | argumento-padrão em `bodyMetrics` + `officialFingerprint` das dez conferido byte a byte |
| **R2** | enfraquecer as 7 testemunhas (§1.8) | repontar para os valores canônicos novos **com comentário**, como foi feito com a Saturno na Etapa 1 — nunca afrouxar para `toMatchObject` |
| **R3** | estourar `baixa` (folga 628) | C3 custa 0 vértices; o cabelo de C2 é medido nos 4 níveis antes de entrar |
| **R4** | custo de shader para todos | ramo por uniforme; medir com os 54 habitantes em cena |
| **R5** | a peça nova vazar para a cidade | §1.7 — duas listas + teste, no mesmo commit |
| **R6** | silhueta masculina deformar roupa existente | `SHAPE_MASC` só é aplicado a quem é `'masc'`; nenhum habitante masculino usa saia (travado na Etapa 2) |

---

## 5. Ordem de execução

1. **C1** silhueta + provar as dez deusas idênticas e medir o V do Aérion.
2. **C2 dados** — catálogo, audiência, exclusões, `sex: 'masc'` na ficha.
3. **C2 geometria** — cabelo cósmico, medido nos 4 níveis.
4. **C3 shader** — acabamento novo + campo procedural.
5. **Testemunhas** repontadas + testes novos + regressão + build.

Paro ao fim de cada bloco se algo divergir do previsto.

> **A entrega é única (ver §12).** Os blocos são ordem de execução, não de
> publicação: C1 e C2 não vão para a `main` em separado, e nenhum commit,
> tag ou PR é criado antes de C3 estar pronto e aprovado.

---

## 6. Critérios de aceitação

- As dez deusas: `officialFingerprint` **idêntico**, byte a byte.
- Aérion: `sex === 'masc'` e peito/cintura **≥ 1,20**.
- Vértices: `baixa` ≤ **4 982**, `ultra` ≤ **44 905** (tetos atuais do panteão).
- **Zero** habitantes com `cosmos`/`criador` em 500 sorteios.
- **Zero** avatares além do Aérion com `uCosmos` ligado.
- Regressão sem falha nova sobre a linha de base.
- Toda peça nova provada por **mutação**, como na Etapa 2 (10/10 pegos).

---

## 7. O que **não** entra nesta etapa

- Tela de criação de avatar / escolha de sexo pelo jogador.
- Remasterizar qualquer uma das dez deusas.
- Mudar `SAVE_VERSION` (continua 3).
- Tornar o catálogo masculino disponível ao jogador.

---

## 8. Linha de base para comparar depois

- Regressão (máquina rápida): **1 468 testes · 1 456 ok · 1 falha
  preexistente · 11 pulados**.
- `npm run build`: exit 0 · **gzip 403,1 kB**.
- Aérion hoje: 37 107 / 11 464 / 7 104 / 4 354 vértices.
- Aérion hoje: peito/cintura **1,01**; ombro/quadril **1,52**.

---

## 9. Bloco C1 — executado

Autorizado isoladamente e concluído. **Nada commitado.**

### O que foi feito

| Arquivo | Mudança |
| --- | --- |
| `src/player/body/BodyShape.ts` (novo, 135 linhas) | O eixo de silhueta. `SHAPE_FEM` com **todo fator = 1** (a identidade matemática) e `SHAPE_MASC` com oito fatores de largura. Nenhum comprimento entra no eixo. |
| `src/player/body/BodyRig.ts` | `bodyMetrics(p, shape = SHAPE_FEM)`. Os fatores multiplicam as **medidas derivadas**; `BodyProportions` não foi tocado, e por isso `proportionsFingerprint` não se moveu. |
| `src/player/Avatar.ts` | 3º parâmetro opcional + campo `readonly shape`, propagado às duas chamadas de `bodyMetrics` (construtor e `rebuild`). |
| `src/characters/Pantheon.ts` | Campo opcional `shape?: BodyShapeId` em `EdenCharacter`; **só a ficha do Aérion** declara `'masc'`. |
| `src/characters/CharacterModels.ts` | `officialShape(id)`; `createOfficialAvatar` passa a forma; `officialFingerprint` ganha o sufixo `|forma:…` **apenas para quem declara forma**. |

### Resultados medidos

Razões do Aérion (nos números que alimentam a malha):

| | antes | agora | alvo |
| --- | --- | --- | --- |
| peito / cintura | 1,012 | **1,260** | ≥ 1,20 |
| ombro / quadril | 1,523 | **1,790** | — |

Medido **na malha construída** (nível ultra, por osso dominante): peito 36,4 → 39,6 cm · cintura 31,4 → 29,1 cm · ombro 56,6 → 60,6 cm · quadril 36,4 → 35,5 cm. Razão peito/cintura da malha: 1,162 → **1,360**. 80,6% dos vértices se deslocaram, no máximo 2,0 cm.

**Custo de geometria nos quatro níveis: zero vértice.**

| nível | antes | agora | teto do panteão |
| --- | --- | --- | --- |
| ultra | 37 122 | 37 122 | 44 953 (maze) |
| alta | 11 464 | 11 464 | — |
| media | 7 104 | 7 104 | — |
| baixa | 4 354 | 4 354 | 4 982 (akemi) |

Custo de pacote: **+164 bytes gzip** (JS 403,08 → 403,24 kB).

### Isolamento

- As dez deusas: **0 campos divergentes** em `bodyMetrics` e **0 vértices deslocados** na malha reconstruída.
- Os 54 habitantes (26 masculinos): **0 campos divergentes** — a cidade não foi tocada, como combinado.
- Impressão digital: as dez permanecem **byte a byte** iguais ao ouro da Etapa 1; o Aérion é a string antiga **mais** `|forma:masc` — o que prova que nele também não mudou mais nada.

### Testes

`tests/unit/aerion-silhueta.test.ts` (411 linhas, **25 testes**) + 1 teste repontado em `sexo-dados.test.ts`. Suíte provada por **mutação: 8 mutantes, 8 pegos**. O mutante M6 (vazar a forma dentro de `createOfficialAvatar`) **sobreviveu na primeira rodada** e revelou que nenhum teste passava pelo ponto onde o corpo é realmente construído; o bloco "a ligação com o jogo" existe por causa dele.

Regressão: **1 494 testes · 1 472 ok · 11 falhas**, todas `Test timed out in 5000ms` nos mesmos 7 arquivos pesados de antes — os 186 testes desses arquivos passam **186/186** com teto de 120 s. `tsc --noEmit` e `npm run build` saem 0.

### Comparação visual

`docs/aerion-c1-silhueta.svg` — contornos reais extraídos da malha (não um desenho), antes e agora sobrepostos.

### Não entrou (aguarda autorização)

C2 (`'cosmos'`, `'criador'`, `Finish.Cosmos`) e C3 (campo procedural no fragmento). O Aérion continua de `longo`/`aero`/`aureola`.

---

## 10. Revisão técnica final de C1

Oito pontos verificados. **Um problema encontrado e corrigido.**

| # | Ponto | Como foi verificado | Resultado |
| --- | --- | --- | --- |
| 1 | Persistência | `SAVE_VERSION`, campos de `AvatarAppearance`, save em branco serializado, carga de save anterior, `sanitizeAppearance` com `shape` contrabandeado | versão **3 → 3**; 11 → 11 campos; save **1 920 bytes idêntico**; 0 ocorrências de `shape`/`forma`/`masc` no JSON; campo contrabandeado descartado |
| 2 | Compatibilidade | `bodyMetrics(p)` da árvore atual × árvore sem C1, 411 corpos × 20 medidas, com `Object.is` | **8 220 comparações, 0 divergências** |
| 3 | Isolamento | `grep` de `shape` em todo o `src`; forma efetiva dos 11 pela fábrica | só `aerion:masc`; os outros dez `fem` |
| 4 | Integração real | teste mede a malha do `SkinnedMesh` que sai de `createOfficialAvatar`; mutante M6 comprova | passa pela fábrica e pela geometria construída |
| 5 | Não-regressão | 11 fichas × 4 níveis e 54 habitantes, vértice a vértice, contra a árvore sem C1 | **0 vértices deslocados** em dez deusas (~60–76 mil por figura) e nos 54 habitantes; Aérion 46 914 (pedido) |
| 6 | Mutação | 8 mutantes, todos compilando, contra o código final dos testes | **8 pegos, 0 sobreviventes** |
| 7 | Desempenho | `vite build` nas duas árvores, `dist` limpo, mesma régua | JS gzip **403,08 → 403,24 kB (+164 bytes)**; CSS e `three.js` inalterados |
| 8 | Diff | leitura integral dos 4 arquivos de C1 + busca de rastro de C1 nos arquivos das Etapas 1–2 | nada fora do escopo |

### Problema encontrado e corrigido

**Limiar absoluto frágil na malha.** Duas asserções exigiam razão peito/cintura ≥ 1,30 medida na geometria. A razão depende de quantos anéis cada nível amostra, e medindo os quatro: ultra 1,360 · alta 1,330 · **media 1,277** · baixa 1,362. O piso reprovaria em `media`, e passava só porque os testes mediam `ultra` e o nível padrão da fábrica (`alta`, margem de 2,3%). Trocado por comparação **relativa ao mesmo corpo na forma de referência** (ganho ≥ 1,12; medido +17,0% a +22,7%) em **todos os quatro níveis**, com piso absoluto folgado de 1,25. Os oito mutantes foram reconferidos depois da correção.

### Pontos confirmados por inspeção

- **`armWrist`, `legAnkle` e todos os comprimentos ficam fora do eixo** — punho e tornozelo são osso, e braço/perna/altura são assunto de `BodyProportions`.
- **O fallback `new Avatar(deity.character.appearance)` (`NpcSystem.ts:1391`) é inalcançável** para membros do panteão: só dispara se `createOfficialAvatar` devolver `null`, e os onze devolvem avatar.
- **`Avatar.shape` não é API de teste**: `rebuild` depende dela para não perder a forma ao trocar de nível gráfico.
- **`officialShape` segue a família `officialAppearance`/`officialProportions`**, que já existiam na base e já eram consumidas por testes.

### Estado

`tsc --noEmit` 0 · `vite build` 0 · suíte **1 494 · 1 475 ok · 8 falhas, todas `timed out in 5000ms`** (zero falhas de conteúdo; os 7 arquivos lentos passam 186/186 com teto de 120 s). **Nenhum commit criado — HEAD segue em `7650efc`.** C2 e C3 não iniciados.

---

## 11. Relatório do bloco C2 — as peças exclusivas

**Escopo entregue, e só ele:** o penteado `cosmos`, o traje `criador` e o acabamento `Finish.Cosmos` (tabelas apenas). O campo estelar animado continua sendo C3 e **não foi iniciado** — nenhum shader, nenhum uniforme, nenhuma animação nova.

### O que foi escrito

| Arquivo | O que mudou |
| --- | --- |
| `BodyRig.ts` | `Finish.Cosmos = 8`, nono valor do enum |
| `BodyFinish.ts` | nona entrada nas 7 tabelas paralelas; `pick()` intocado |
| `AvatarAppearance.ts` | `'cosmos'` e `'criador'` no catálogo, com rótulo; `AERION_ONLY_HAIR`/`AERION_ONLY_OUTFIT`; `CREATOR_HAIR_STYLES`/`CREATOR_OUTFITS` |
| `BodySurface.ts` | campo `skinFinish`, para o acabamento da pele deixar de ser constante |
| `BodyBuilder.ts` | traje `criador` (tronco, braços e pernas nus; corpo em `Finish.Cosmos`); penteado `cosmos` (91 linhas) |
| `AvatarCreator.ts` | o criador do jogador passou a ler as listas filtradas |
| `Pantheon.ts` | a ficha do Aérion aponta para as duas peças novas |

### As três barreiras de exclusividade

A Etapa 1 mostrou que uma lista de exclusão existir não impede nada — 34 de 54 habitantes usavam cabelo de deusa porque o sorteio não a lia. Por isso a exclusividade do Aérion fecha em três portas, e **cada uma tem mutante próprio**:

1. **sorteio de habitante** — `CITIZEN_*` filtram pelos dois `Set`;
2. **criador de avatar do jogador** — `CREATOR_*`, lidas pela tela;
3. **ficha oficial** — só o Aérion declara as peças.

### Prova

| # | Pergunta | Como foi medido | Resultado |
| --- | --- | --- | --- |
| 1 | As deusas mudaram? | 10 fichas × 4 níveis, posição **e** acabamento, contra a árvore pré-C2 | **0 deslocados, 0 repintados** (~60–76 mil vértices por figura) |
| 2 | Os habitantes mudaram? | 54 aparências + malha completa | **0 alterados** |
| 3 | A peça vazou? | listas, 54 habitantes, 500 sorteios, tela do criador montada | **0 ocorrências** |
| 4 | O corpo é cósmico? | histograma de acabamento nos 4 níveis | `Cosmos` + `Eye` = **100 %**; zero `Cloth`, `Skin` e `Hair` |
| 5 | O corpo está nu? | sonda de cores primárias, 4 níveis | **0 vértices** de `topColor`/`bottomColor`; `camiseta` e `banho` seguem vestidos |
| 6 | Cabe no orçamento? | vértices contra o teto do panteão | ultra 34 625 ≤ 44 953 · baixa 2 852 ≤ 4 982 |
| 7 | Mutação | 12 mutantes nas três barreiras e nas peças | **12 pegos, 0 sobreviventes** |
| 8 | Custo | `vite build`, `dist` limpo | JS gzip **403,24 → 403,74 kB (+500 bytes)** |

**O Aérion ficou mais barato que antes do C2 em todos os quatro níveis** (ultra 37 122 → 34 625): o traje do criador não desenha pano nenhum, e a geometria que ele devolve paga a crista e a esteira do cabelo novo. É a confirmação prática do princípio da Etapa 3 — *o cósmico é acabamento, não geometria*.

### Problemas encontrados e corrigidos

**1. O corpo saía vestido de pano.** A primeira medição achou 6 069 vértices ainda em `Finish.Cloth`. Causa: `subdivideProfile` **descarta o `finish` das estações** — os anéis que ele interpola herdam o `b.surface` vigente. Marcar a estação não pinta nada; quem manda é `b.surface`/`b.skinFinish`. Corrigido na origem.

**2. A pelve continuava com cor de guarda-roupa.** O perfil do tronco pinta a pelve com `bottomColor` em todo mundo que não usa vestido — é o cós da bermuda de banho. Num corpo cósmico de ponta a ponta isso era um resquício: uma cor de guarda-roupa, que ninguém pode editar no Aérion, desenhada na pele dele. Agora `criador` pinta a pelve com a cor do corpo. A bermuda de banho não foi tocada, e um mutante guarda a diferença.

**3. Um mutante sobreviveu, e abriu um buraco de método.** Tirar `criador` de `bareArms` não quebrava teste nenhum: as mangas nasciam **cósmicas**, porque o acabamento do corpo inteiro é cósmico — a malha continuava 100 % `Cosmos` com o personagem vestido. Medir acabamento não prova nudez. A prova passou a ser por **cor**, e com paleta trocada: na paleta real dele `skin` #2a2350 e `bottomColor` #2b1d5a são o mesmo roxo a menos de um milésimo em espaço linear. A sonda troca as três cores por primárias puras, mantém a geometria e pergunta onde cada uma foi parar. Filtro de cor **pura**, não de canal dominante: os lábios são avermelhados por conta própria.

### Testemunhas repontadas

Oito casos de outros marcos travavam números que o C2 muda de propósito. Nenhum foi apagado:

- **6 casos** (amara ×2, haru, jupiter, maze ×2) citavam `longo`/`aero` como peça genérica de exemplo — repontados para um portador sintético, com a peça seguindo no catálogo.
- **`amara-remaster.test.ts`** travava os quatro números de triângulos do Aérion desde `f38a2ec`. Repontado com a medida nova **e com a antiga registrada no comentário**: baixa 8 220 → **7 540** · media 12 948 → **12 416** · alta 20 330 → **20 098** · ultra 66 224 → **70 874** (sobe só em `ultra`, onde a crista e a esteira existem).
- **`sexo-dados.test.ts`**, o teste-ouro, continua afirmando a impressão digital do Aérion como *a string antiga mais as mudanças autorizadas* — agora o sufixo de forma do C1 e a troca das duas peças. Qualquer alteração de carona em altura, gestação, Afters ou nas onze proporções cai nele.
- **`nexara-remaster.test.ts`** exigia 8 entradas por tabela de acabamento, escrito como `Finish.Holo + 1`. Em vez de trocar por `Finish.Cosmos + 1` — que mandaria o próximo marco repontar de novo —, passou a contar o enum. Guarda o mesmo, e sozinho.

---

## 12. Decisão de integração — entrega única (D9)

**Decisão do Criador, registrada em 12/11/2026.** O Aérion 2.0 é **uma transformação só**. C1 e C2 **não** são mesclados em separado: nada vai para a `main` antes de C3 estar pronto, revisado e aprovado.

### Sequência obrigatória

| # | Etapa | Estado |
| --- | --- | --- |
| 1 | C1 — silhueta masculina | **concluído e aprovado** |
| 2 | C2 — cabelo `cosmos`, traje `criador`, `Finish.Cosmos` | **concluído e aprovado** |
| 3 | C3 — campo estelar procedural no shader | **concluído — ver §13**, aguarda aprovação |
| 4 | Regressão completa das três etapas | feita: 1 543 · 1 532 ok · 0 falhas |
| 5 | Revisão integral do diff acumulado | aguarda aprovação do C3 |
| 6 | Comparação visual nos quatro níveis gráficos | parcial — ver a limitação em §13 |
| 7 | Auditoria de desempenho, compatibilidade e isolamento | feita para o C3 — §13 |
| 8 | Relatório final para aprovação | aguarda aprovação do C3 |

### Regras de integração

1. **Nenhum commit, tag, release ou PR** criado por antecipação.
2. **Nenhuma mesclagem isolada** de C1 ou C2.
3. **Histórico e testes das três etapas preservados** — testemunha repontada se explica no comentário, nunca se apaga.
4. **As dez deusas e os 54 cidadãos não mudam.**
5. **C3 não começa sem autorização específica.**
6. Depois de C3, **aguardar a aprovação final** antes de preparar a mesclagem.

### Conferência do estado nesta data

| Regra | Verificação | Resultado |
| --- | --- | --- |
| Sem commit antecipado | `git rev-list --count 7650efc..HEAD` | **0** |
| Sem tag nova | `git tag -l` | só `v0.5.0`, do marco anterior |
| Sem branch publicada | `git ls-remote --heads origin` | **nada publicado** |
| Sem PR | `gh pr list --state all` | **nenhum** |
| C1 e C2 juntos na árvore | `git status --short` | 16 arquivos modificados + 10 novos, os dois blocos juntos |
| Deusas e cidadãos intactos | comparação vértice a vértice contra a árvore pré-C2 | **0 deslocados, 0 repintados** |

### Linha de base acumulada C1+C2 (para o relatório final comparar)

- **Regressão:** 1 519 testes · 1 508 ok · **0 falhas** · 0 arquivos falhos (`main` em `7650efc` dava 1 394 · 1 382).
- **Build:** JS gzip **403,74 kB** (`main` 403,08 · pós-C1 403,24).
- **Aérion, vértices:** ultra 34 625 · alta 9 150 · media 5 300 · baixa 2 852 — abaixo do teto do panteão nos quatro.
- **Aérion, triângulos:** baixa 7 540 · media 12 416 · alta 20 098 · ultra 70 874.
- **Diff acumulado:** 16 arquivos tocados, +1 022 −91, mais 10 arquivos novos (`BodyShape.ts`, 4 testes, 5 documentos).

### O que C3 vai tocar, quando for autorizado

Para a autorização ser dada de olhos abertos — **nada disto foi escrito ainda**:

- **`BodySurface.ts` / shader do corpo:** campo procedural no fragmento, escolhido por `vBind`, atrás de um uniforme `uCosmos`.
- **Isolamento:** o uniforme nasce em 0 para todo avatar; só o Aérion o recebe diferente de zero. **Critério:** 0 avatares além dele com `uCosmos` ativo, provado por mutação.
- **Risco principal (R4):** custo de shader cobrado de todo mundo. A medida tem de mostrar que o ramo novo não aparece na conta de quem não é o Criador.
- **O que C3 _não_ é:** nenhuma geometria nova. O princípio da Etapa 3 — *o cósmico é acabamento, não geometria* — já foi confirmado na prática pelo C2, em que o traje do criador tem zero vértices de roupa.

---

## 13. Relatório do bloco C3 — o campo estelar

**Escopo entregue:** o acabamento cósmico procedural do Aérion no fragmento, pelo uniforme `uCosmos`, com a região escolhida por `vBind`. **Nenhuma geometria nova** — ligar o campo não acrescenta um vértice ao Criador, e há um caso de teste que afirma exatamente isso.

### Arquivos

| Arquivo | Δ | O que mudou |
| --- | --- | --- |
| `src/player/body/BodyCosmos.ts` | **novo, 246 linhas** | o GLSL do campo: máscara, ruído, nebulosa, braços de galáxia, fluxos e estrelas |
| `src/player/Avatar.ts` | +43 −5 | uniformes, sinalizador `cosmos`, injeção condicional, chave de cache, relógio |
| `src/characters/CharacterModels.ts` | +17 −1 | `officialCosmic()` e a fábrica passando o sinalizador |
| `src/characters/Pantheon.ts` | +15 | campo `cosmic?: boolean` e `cosmic: true` na ficha do Aérion |
| `src/lab/main.ts` | +16 −3 | a bancada passa a montar o oficial como o jogo monta |
| `tests/unit/aerion-campo-cosmico.test.ts` | **novo, 399 linhas** | 24 casos |

### Como o isolamento foi construído

São **dois cadeados**, e a diferença entre eles importa:

1. **O programa.** O GLSL do campo só é injetado no material de quem tem o sinalizador, e `customProgramCacheKey` ganha o sufixo `-cosmos`. O habitante comum não roda um desvio a mais: *o código não existe no shader dele*. Sem o sufixo na chave, o Three.js serviria o programa guardado e o segundo avatar a compilar receberia o shader do primeiro — um mutante guarda essa linha.
2. **O uniforme.** `uCosmos` nasce zero em **todo** avatar e sobe só na fábrica oficial. Se um dia alguém injetar o bloco por engano, ele continua desligado.

A seleção é por **id**, via `EdenCharacter.cosmic`. Não há caminho que a deduza de sexo, silhueta, traje ou acabamento — e o caso mais importante da suíte prova a consequência: um avatar montado à mão com a ficha inteira do Aérion (mesma aparência, mesmas proporções, mesma silhueta, portanto cabelo `cosmos`, traje `criador` e corpo todo em `Finish.Cosmos`) **continua sem campo**. Parecer o Criador não é ser o Criador.

### Desempenho

| Pergunta | Medida | Resultado |
| --- | --- | --- |
| O cidadão comum paga alguma coisa? | fragmento e vértice gerados, comparados caractere a caractere com a árvore pré-C3 | **idênticos** (11 435 e 8 660 caracteres) em luma, maze, amara e haru — **0 divergências** |
| Quanto custa o Criador? | contagem estática no fragmento | 488 → 712 operações (+224); o bloco cósmico tem 139 linhas |
| Ramificações | leitura do GLSL | um desvio só, por uniforme — coerente para todo o rasterizador, sem divergência entre fragmentos |
| Programas em cena | chaves de cache | 4: `fisico`, `simples`, `fisico-cosmos`, `simples-cosmos` — o Criador acrescenta **um** programa, não um por avatar |
| Máquina fraca | picadas de ruído por fragmento | **36 no material físico, 20 no simples** (duas oitavas, sem dobra de domínio) — o degrau é o `setMaterialTier` que já existia |
| Passe de sombra | material de profundidade | **intocado**: a sombra não paga galáxia |
| Tamanho | `vite build`, `dist` limpo | JS gzip **403,74 → 405,87 kB (+2,13 kB)** |

### Testes

- **24 casos novos**, cobrindo: seleção por identidade, as dez deusas, 54 habitantes, o avatar padrão, o sósia, o conteúdo dos dois programas, a varying de pose de ligação, a máscara por acabamento, a chave de cache, o degrau de material, o passe de profundidade, o relógio (início, avanço, troca de nível e de material) e a integridade de C1 e C2.
- **Sanidade do GLSL sem GPU.** Como nada aqui compila shader, três casos passam o texto gerado por um verificador estrutural: delimitadores equilibrados, nenhuma função `eden*` chamada sem existir, nenhuma usada antes de ser declarada. É o substituto possível para o erro de digitação que, no navegador, apareceria como tela preta.
- **Mutação: 15 mutantes, 15 pegos, 0 sobreviventes.**

### Problemas encontrados e corrigidos

**1. Um mutante equivalente, resolvido tirando o literal em vez de testando o inalcançável.** O ramo de reserva de `edenCosmosMask` (quando nenhum acabamento pesa) é inatingível com dado válido, e um mutante que o acendia sobreviveu. Em vez de escrever um teste para o impossível, o padrão passou a ser **gerado da própria tabela**, como o `pick()` do `BodyFinish` já fazia. O literal sumiu, e com ele a porta que ninguém conferiria.

**2. O campo saía leitoso.** Com o limiar baixo, a nebulosa cobria o corpo inteiro e o resultado era um manto claro, não um céu; as estrelas se afogavam. A máscara ganhou limiar mais alto e foi elevada ao quadrado, abrindo buracos de espaço profundo entre as nuvens, e os braços de galáxia e os fluxos passaram a morar **dentro** da nebulosa em vez de soltos por cima do corpo.

**3. A bancada mostrava uma figura que não existe.** O modo `deusa` do laboratório montava o personagem com o corpo de referência, sem silhueta e sem campo — justamente a tela que o Criador usaria para conferir. Agora ela monta o oficial como o jogo monta. Para as dez deusas nada muda: todas usam `SHAPE_FEM`, cujos fatores valem 1.

### Limitação do ambiente, declarada

**Não há Chromium nem GPU neste sandbox.** Em consequência:

- **nenhum shader foi compilado** e **nenhuma comparação pixel a pixel foi executada** — nem é afirmada;
- o que se mediu do desempenho é **estático** (texto do programa, contagem de operações, número de programas), não tempo de quadro medido em placa;
- a comparação nos quatro níveis gráficos foi feita onde é possível aqui: **o shader é o mesmo nos quatro** (o nível muda a geometria, e o degrau de custo do campo é o do material), com 34 625 · 9 150 · 5 300 · 2 852 vértices;
- a referência visual `docs/aerion-c3-campo.png` **não é um render do shader**: é um rasterizador escrito para esta conferência, que avalia as mesmas fórmulas por pixel sobre a malha real do Aérion, com uma luz só. Serve para julgar o desenho do campo, não para validar o material;
- **a conferência final é manual**, na prévia ao vivo da porta 5173 (`lab.html`, modo `deusa`, personagem Aérion, nos quatro níveis).

---

## 14. Auditoria final integrada (C1 + C2 + C3)

Auditoria pedida depois de C3 fechado, para julgar as três etapas como
**uma transformação só**, antes de qualquer publicação. Nada foi
commitado, taguear ou aberto em PR: a árvore segue em `7650efc` + as
mudanças de trabalho.

### 14.1 O shader passou por um compilador?

Não existe GPU nem navegador neste ambiente, e a rede só libera
`github`, `npm` e `pypi` — o binário do Chrome vem de
`storage.googleapis.com`, que está **bloqueado**. Nenhum pixel foi
renderizado.

O que foi possível fazer, e foi feito: montar o **programa final**
exatamente como o `WebGLProgram` do Three.js o monta (prefixo de
precisão, `#define` do material físico, atributos, e todos os
`#include <chunk>` resolvidos de verdade) e submeter os oito shaders
resultantes a um **analisador de GLSL ES**, o `@shaderfrog/glsl-parser`,
instalado fora do repositório.

| programa | `uCosmos` | `vBind` | funções cósmicas | chamadas órfãs | análise |
|---|---|---|---|---|---|
| aerion-fisico `.frag` | sim | sim | 5/5 | nenhuma | OK |
| aerion-fisico `.vert` | não | sim | 0/5 | nenhuma | OK |
| aerion-simples `.frag` | sim | sim | 5/5 | nenhuma | OK |
| aerion-simples `.vert` | não | sim | 0/5 | nenhuma | OK |
| luma-fisico `.frag` | **não** | **não** | **0/5** | nenhuma | OK |
| luma-fisico `.vert` | **não** | **não** | **0/5** | nenhuma | OK |
| luma-simples `.frag` | **não** | **não** | **0/5** | nenhuma | OK |
| luma-simples `.vert` | **não** | **não** | **0/5** | nenhuma | OK |

Os 2 347 e 2 342 linhas de fragmento do Aérion e as 2 206 e 2 202 da
Luma foram analisadas na íntegra. **Nenhum erro, nenhuma chamada a
função não declarada.**

**O alcance dessa ferramenta foi medido, não suposto.** Injetei nove
defeitos no fragmento do Aérion e contei quantos ela pega:

| defeito | veredito |
|---|---|
| parêntese não fechado | **pego** |
| chave sobrando no bloco | **pego** |
| ponto e vírgula removido | **pego** |
| argumento vazio na chamada | **pego** |
| operador solto antes do `=` | **pego** |
| tipo escrito errado (`floatt`) | passa |
| palavra-chave inválida (`voidd`) | passa |
| chamada a função inexistente | passa |
| `vec4` atribuído a `vec3` | passa |

**5 de 9.** Ela cobre a camada **sintática** por inteiro e é cega para
tipos e símbolos — é um analisador, não um compilador. A lacuna do
símbolo inexistente foi fechada à parte, com um verificador que percorre
a árvore sintática, junta as funções declaradas e as chamadas, e exige
que toda chamada resolva (os construtores de `struct` e as macros do
Three são filtrados para não dar falso positivo). As quatro colunas
"chamadas órfãs: nenhuma" da tabela acima vêm dele.

Fica valendo o que já estava dito: **isto não substitui compilar**. Não
houve validação pixel a pixel, nem medição de tempo de quadro.

### 14.2 Regressão, mutação e as duas armadilhas que apareceram

| medida | resultado |
|---|---|
| regressão completa | **389 suítes · 1 543 testes · 1 531 passam · 11 pulados · 1 falha** |
| `tsc --noEmit` | limpo |
| build | JS gzip **405,87 kB** (índice 259,36 + three 146,51) · CSS 9,88 kB |
| mutação C3 | **15 de 15 pegos, 0 sobreviventes** |
| mutação C2 | **12 de 12 pegos, 0 sobreviventes** |
| comparador C1/C2 | **0 divergências** |
| diff acumulado | **17 arquivos, +1 172 −99**, mais 13 novos |

**A falha única é preexistente e não tem relação com este trabalho.** É
`coracao-roseiral.test.ts`, que estoura o limite padrão de 5 000 ms. O
teste leva ~6,5 s por natureza; sozinho, passa (34 de 34). A prova:
rodado no commit base `7650efc`, **sem C1, C2 nem C3**, o mesmo teste
leva **6 985 ms** — mais lento ainda do que com as mudanças. É um teste
no limiar, que passa ou falha conforme a carga da máquina. Aumentar o
limite dele seria mexer em sistema alheio ao C3, o que está fora do
escopo autorizado; fica registrado.

Duas armadilhas de ferramenta apareceram no caminho e valem registro,
porque ambas produziriam relatório falso:

1. **Backup dessincronizado apaga trabalho.** Os roteiros de mutação
   restauram os arquivos de um backup ao fim de cada mutante.
   `/tmp/bak4` guardava o `BodyCosmos.ts` **anterior** ao reajuste do
   campo, e `/tmp/bak3` guardava o `Pantheon.ts` **anterior** ao C3.
   Rodar a mutação do C2 sem perceber isso reverteu as quinze linhas do
   C3 no `Pantheon.ts` e quebrou a tipagem — o relatório saiu com
   "compila: NÃO" nos doze mutantes. Backups sincronizados, estado
   reposto e a mutação do C2 refeita: **12 de 12, nove deles compilando
   limpo**. Antes de rodar roteiro que restaura, conferir o backup.
2. **Âncora de mutante envelhece.** O `M6` apontava para
   `cosmosFragmentGLSL()` e o código já era `cosmosFragmentGLSL(physical)`.
   Âncora que não casa vira "sobrevivente" silencioso. As quinze âncoras
   passaram a ser conferidas antes de cada rodada.

### 14.3 O que o cidadão comum paga pelo C3

Medido contra a árvore sem C3, com o GLSL já reajustado:

| | Aérion | Luma · Maze · Amara · Haru |
|---|---|---|
| fragmento | 11 435 → **16 654** caracteres | **11 435 — idêntico** |
| vértice | 8 660 → **8 700** | **8 660 — idêntico** |
| operações (estáticas) | 488 → **734** | inalteradas |

**Zero divergências.** O shader de quem não é o Criador é o mesmo texto,
byte a byte. O bloco cósmico tem 148 linhas e 226 operações, e só existe
no programa de quem tem `cosmos`. A cena ganha **um** programa, não um
por avatar: `eden-avatar-organico-{fisico,simples}[-cosmos]`.

**Observação de auditoria.** `uCosmos` e `uCosmosTime` são anexados ao
objeto de uniformes de **todos** os avatares, mesmo nos que não têm o
bloco cósmico — onde ficam ociosos, já que o GLSL deles não os declara.
Isso é deliberado e está comentado no código: é o único ponto onde a
invariante "nasce zero em todo avatar" pode ser conferida por teste. O
custo por quadro é **zero**, e isso foi verificado na fonte do Three.js,
não suposto: `WebGLUniforms` monta sua lista percorrendo apenas os
`ACTIVE_UNIFORMS` do programa já compilado, e `upload()` percorre essa
lista — um uniforme ausente do GLSL nunca é visitado nem enviado à
placa. Fica como está; se a preferência for não anexá-los, a troca é de
duas linhas e o teste da invariante passa a afirmar ausência em vez de
valor zero.
