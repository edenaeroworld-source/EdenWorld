# Haru 2.0 — Remasterização Oficial · plano técnico

**Branch:** `arena/4e0d78d0-edenworld` (a partir de `9d96910`, a `main` depois do marco da Saturno)
**Personagem:** Haru — Deusa da Tecnologia e dos Sistemas, primeira deusa autista do Panteão
**Estado:** plano escrito **antes** de qualquer linha de geometria, como o briefing exige.

---

## 1. O que a investigação encontrou

### 1.1 A Haru de hoje é um habitante em ciano

```
look('#f6c9a4', 'curto', '#7fd6ff', '#2f6fb3', 'aero', '#29c8ff', '#2e3a4f', '#f4f6fb', 'oculos', 0.99)
```

Na bancada: uma touca lisa, óculos redondos escuros, blusa ciano de
manga comprida e calça azul-marinho. Nada de circuito, nada de
emissão, nada de assimetria.

E **os três campos de aparência dela são compartilhados**:

| campo | valor | quem mais usa |
|---|---|---|
| `hairStyle` | `curto` | habitantes (está em `CITIZEN_HAIR_STYLES`) |
| `outfit` | `aero` | habitantes, **Aérion — o Criador** e Amara |
| `accessory` | `oculos` | habitantes (`CITIZEN_ACCESSORIES` exclui só `lentes`) |

O caso do `aero` é o mais grave que já apareceu nesta série de
marcos. Remasterizar o traje onde ele mora mudaria **o Criador do
Éden Aero** e a Deusa da Maternidade junto — e os dois têm número de
triângulos idêntico ao da Haru sem óculos, prova de que dividem a
peça inteira:

```
aerion   baixa=6288  media=11016  alta=18398  ultra=64292
amara    baixa=6288  media=11016  alta=18398  ultra=64292
```

**Decisão: `aero` não será tocado.** A Haru ganha traje próprio.

### 1.2 O cânone já contradizia o modelo

A bio dela em `Pantheon.ts` diz, hoje:

> "Azul, ciano, aqua e prata; cabelo em **chanel assimétrico**;
> reflexos digitais nos olhos e desenhos de circuito no traje."

O modelo não tem chanel, não tem reflexo digital e não tem circuito
nenhum. **Três das quatro promessas do texto não existiam na
geometria.** Este marco entrega as três.

### 1.3 O conflito do cabelo, e como foi resolvido

O briefing listou "cabelo curto assimétrico, com corte bob e franja"
entre as **características oficiais a preservar** — e a arte de
referência enviada no mesmo pedido mostra cabelo **muito longo**,
abaixo da cintura. Os dois não podem valer ao mesmo tempo.

**Perguntado, o Criador escolheu o cabelo longo da arte.** Isso é uma
alteração de característica oficial, autorizada expressamente, e por
isso **a bio será corrigida junto**: deixar o texto prometendo chanel
enquanto a malha entrega cabelo longo recriaria exatamente o problema
descrito em 1.2.

### 1.4 Território: a Nexara fica ao lado

| | Haru | Nexara |
|---|---|---|
| título | Deusa da **Tecnologia e dos Sistemas** | Deusa da **Internet e das Redes Sociais** |
| domínio | EdenOS, infraestrutura, software | EdenGram, EdenTalk, EdenFeed |
| paleta | `#8fe6ff` · `#1b82ea` | `#d6b8ff` · `#7a3fe0` |
| aura | `0x7fd6ff` ciano | `0xc9a2ff` lilás |
| remasterizada | **este marco** | **sim**, já na `main` |

As duas são "deusas digitais" e o risco de leitura igual é real. A
Nexara já foi entregue em **branco e lilás**, com **anéis orbitando a
cabeça** como assinatura (`buildOrbitRings`, cores `0x9fe8ff` e
`0xc9b6ff`).

**Separação adotada:**

- a Haru **não** ganha anel orbitando nada — é assinatura da Nexara;
- a Nexara é **clara e lilás**; a Haru será **grafite e ciano**, com a
  luz vindo da emissão, não da cor do pano. É a diferença entre
  "a rede, que é leve e flutua" e "o sistema, que é maquinário aceso";
- a Nexara é fluxo; a Haru é **infraestrutura**.

### 1.5 Orçamento — e os 524 triângulos presos no acessório

| avatar | baixa | media | alta | ultra |
|---|---|---|---|---|
| **haru** | **6 642** | 11 290 | 18 534 | 63 396 |
| teto | **7 145,6** | — | — | — |

Folga: **503,6**. Apertado, mas — diferente da Saturno — não estourado.

Decomposto no LOD baixo:

| peça | custo | corta por LOD? |
|---|---|---|
| `oculos` | **524** | **não** |
| cabelo `curto` | 210 | não (é só a calota) |
| `aero` sobre `casual` | 360 | — |

O acessório `oculos` sozinho come **todo** o orçamento livre e é
construído inteiro mesmo a três metros, onde uma armação de meio
centímetro não chega a um pixel. É a mesma armadilha da `flor` da
Saturno (912) e das flores da Akemi.

**Trocar `oculos` por peça própria que corta por LOD libera 524.**
Somado à folga atual: **1 027 triângulos** para gastar.

Referência de custo do cabelo longo: a Amara usa `longo` + `aero` +
`nenhum` e dá 6 288; a Haru sem óculos dá 6 118. Logo **uma queda
longa custa cerca de 170** no LOD baixo.

---

## 2. Decisões do Criador

Perguntado antes de implementar, respondeu:

1. **cabelo longo**, como a arte de referência — com a correção da bio
   que isso implica;
2. **identidade autista: os dois** — peça funcional digna
   (abafadores/protetores auriculares) **e** o símbolo ∞ da
   neurodiversidade;
3. **sem óculos**: trocar por visor/HUD do EdenOS, como na arte;
4. **a ficha pode ser ajustada** nas cores.

### Sobre a representação do autismo

O símbolo escolhido é o **infinito**, que é o endossado pela
comunidade autista. **A peça de quebra-cabeça não será usada** — é
rejeitada por boa parte da comunidade por associação histórica a
campanhas de "cura", e usá-la seria o oposto de respeitoso.

Os **abafadores** entram como equipamento de trabalho, não como
marcador médico: regulação sensorial é prática cotidiana e real, e
numa Deusa da Tecnologia a peça lê como ferramenta de quem opera
infraestrutura. Ela os usa porque funcionam, do mesmo jeito que a
Saturno tem braços nus porque trabalha com as mãos.

Nada disso infantiliza nem vira diagnóstico estampado: o ∞ é uma
insígnia discreta no peito, do tamanho de um distintivo.

---

## 3. O desenho

### 3.1 `fibra` — o penteado exclusivo

**Nome:** Fibra Óptica. Distinto de `fluxo` (Nexara) de propósito:
fibra é infraestrutura, fluxo é tráfego.

- queda **longa**, abaixo da cintura, como a arte de referência — a
  mais longa do Panteão depois da `cascata` da Suki;
- **franja**, preservada da característica oficial;
- **assimetria** preservada: a queda é mais cheia de um lado, e a
  risca sai do centro. O briefing pedia assimetria e ela sobrevive à
  troca de comprimento;
- degradê ciano claro → aqua nas pontas;
- **filamentos emissivos** correndo pelo comprimento, em `Finish.Holo`,
  que leem como dado viajando pela fibra. É o elemento "circuitos
  luminosos" aplicado ao cabelo;
- as mechas são **relevo** (`feature()`), custo zero em triângulos.

**Dentro do penteado nascem, e por isso cortam por LOD:**

- **os abafadores** — concha sobre cada orelha e arco por cima da
  cabeça. Medido na malha: a orelha está em **`|x| = 0,1804`,
  `y = 0,682`, `z = −0,0123`**. As conchas vão em `|x| ≈ 0,20`;
- **o visor do EdenOS** — painel fino em vidro na têmpora direita com
  uma lâmina de HUD à frente do olho. Medido: a frente do rosto na
  linha dos olhos está em **`z ≈ 0,173`**; o visor fica em `z ≳ 0,19`
  para não nascer dentro da bochecha.

Nascer no penteado, e não em `accessory`, é obrigatório: `oculos`,
`fones` e `chapeu` são herdados pelos habitantes, e `accessory` é um
campo só — pelo caminho do acessório ela não poderia ter abafadores
**e** visor.

### 3.2 `sistema` — o traje exclusivo

**Nome:** Traje EdenOS.

- base em **pano** grafite-azulado. Isto é lição paga no marco da
  Akemi: pôr o traje inteiro em `Finish.Glass` marcou a perna toda
  como vidro, porque `subdivideProfile` descarta o acabamento. O
  vidro e o holograma entram **peça a peça**;
- **traços de circuito** em `Finish.Holo` ciano correndo pelo tronco e
  pelos braços — o pedido literal de "circuitos luminosos". São
  caixas finas, e só existem de `media` para cima;
- **painéis prateados** nos ombros e no peito, em `Finish.Shine`;
- **gola alta**, reaproveitando a gola compartilhada de
  `aurora`/`rede`/`sonora`. Reaproveitar é prática já documentada no
  arquivo ("o Traje Rede usa a mesma gola, e usa de propósito") e
  acrescentar `sistema` à condição **não altera** o que as outras
  três desenham;
- **manga e calça compridas**, como no `aero` — ela é engenheira de
  sistemas, não uma deusa de vestido;
- **o emblema ∞** no peito, em `Finish.Holo`, a `z ≳ 0,12`. Medido: a
  frente do torso chega a **`z = 0,1114`** em `y = 0,30`. No marco da
  Akemi o laço foi parar em `0,082` e ficou enterrado dentro do
  tronco; aqui a cota sai da sonda.

### 3.3 Paleta

Autorizado ajustar. A regra que organiza tudo: **o pano é escuro para
que a emissão seja a luz.** É o que separa a Haru da Nexara, que é
clara.

| | cor | onde |
|---|---|---|
| grafite | `#23324d` | corpo do traje (`topColor`) |
| grafite fundo | `#16203a` | calça (`bottomColor`) |
| prata | `#c9d8e8` | painéis, `Finish.Shine` |
| ciano vivo | `#45e7ff` | circuitos e HUD, `Finish.Holo` |
| azul da ficha | `#1b82ea` | traços fundos — vem da paleta canônica dela |
| cabelo | `#7fd6ff` | **preservado**, é canônico |
| pele | `#f6c9a4` | **preservada** |
| olhos | `#2f6fb3` | **preservados** |

`topColor` sai de `#29c8ff` — que é exatamente o `accent = 0x29c8ff`
que o motor usa como destaque padrão em **todo** avatar. A Haru era
literalmente a personagem pintada com a cor genérica do sistema.

**Preservados:** `aura 0x7fd6ff`, `colors ['#8fe6ff','#1b82ea']`,
título, domínio, tagline, contato, diário, diálogo e o lugar dela em
frente ao Centro EdenConnect.

**Alterado com autorização:** `hairStyle`, `outfit`, `accessory`,
`topColor`, `bottomColor` e a frase da bio sobre o cabelo.

---

## 4. Plano de LOD

O orçamento livre é de **1 027** triângulos no LOD baixo. A regra é a
dos marcos anteriores: `detail.segments >= 14` liga o detalhe.

| nível | segments | o que existe |
|---|---|---|
| **baixa** | 10 | calota, queda longa simples, traje liso, **emblema ∞** |
| **media** | 14 | + abafadores, + visor, + circuitos básicos |
| **alta** | 20 | + traços completos, + filamentos no cabelo |
| **ultra** | 44 | tudo, com mais estações |

O **∞ sobrevive a todos os níveis**, como a pata da Saturno: é a
marca de identidade dela e é barata. Todo o resto corta.

Meta: **LOD baixo abaixo de 6 600**, contra o teto de 7 145,6.

---

## 5. Componentes compartilhados — o que NÃO será tocado

| componente | por quê |
|---|---|
| `aero` | **Aérion (o Criador)** e Amara dependem dele |
| `curto` | penteado de habitante |
| `oculos`, `fones`, `chapeu` | acessórios de habitante |
| `buildOrbitRings` | assinatura da Nexara |
| `subdivideProfile`, `feature()`, `SurfaceBuilder`, rig, shaders | sistemas globais |
| `buildSkirt`, `buildVNeck`, `buildArm`, `buildLeg` | compartilhados |

A gola alta de `aurora`/`rede`/`sonora` será **reaproveitada**, não
modificada: a condição ganha mais um nome, e o que as três desenham
hoje continua idêntico — provado por hash.

---

## 6. Testes previstos

Arquivo novo `tests/unit/haru-remaster.test.ts`, no molde dos marcos
anteriores. Previsão de **~28 casos**:

**Exclusividade (4)** — `fibra` e `sistema` nos catálogos e fora das
listas de habitante; 2 000 sorteios sem nenhum dos dois; sobrevivem ao
saneamento.

**O Criador e a Amara (3)** — `aero` continua em `CITIZEN_OUTFITS`; a
ficha do Aérion e a da Amara, campo a campo, inalteradas; as duas
continuam a desenhar exatamente o mesmo número de triângulos.

**A ficha (4)** — usa `fibra` + `sistema` + `nenhum`; aura, paleta,
título, domínio, olhos, pele e altura preservados; a bio **não**
promete mais chanel; `topColor` deixou de ser o `accent` genérico.

**Território (2)** — a Nexara sai intacta; a Haru **não** tem anel
orbitando a cabeça.

**Orçamento (4)** — cabe no teto; três malhas; cresce com o nível; o
custo do acessório antigo foi de fato liberado.

**O cabelo (4)** — a queda desce abaixo da cintura; não invade o
corredor do braço; o relevo não deforma o crânio (< 2 mm contra o
gabarito `rabo`); o relevo de fato desloca a superfície.

**Cabeça e equipamento (4)** — os abafadores ficam na altura da orelha
e **fora** do crânio; o visor fica à frente do rosto (`z > 0,19`) e não
dentro da bochecha; ambos cortam no LOD baixo.

**O traje (4)** — o ∞ fica à frente do peito (`z > 0,113`), é `Holo` e
**existe em todos os LODs**; os circuitos são `Holo` e cortam por LOD;
a base é pano, não vidro.

**Defeito preexistente (1)** — a pele nua marcada como `Cloth`, medida
igual em vários trajes, documentada e não mascarada.

---

## 7. Validação antes do PR

1. `npx tsc --noEmit`
2. `npx vitest run tests/unit/haru-remaster.test.ts`
3. `npx vitest run` — suíte inteira
4. `npm run build`
5. **hashes** de todo o Panteão, da aparência padrão e de habitantes
   sorteados, nos **quatro LODs**, contra uma árvore limpa em
   `9d96910` via `git worktree`. Esperado: só a Haru difere
6. draw calls no browser: alvo `malhas=3 chamadasDaCena=6`
7. capturas antes/depois, **diurnas e noturnas**, mais os quatro LODs
   lado a lado e a comparação com a Nexara e o Aérion

Falhas preexistentes serão documentadas, não mascaradas. É sabido que
`tests/unit/coracao-roseiral.test.ts` falha por timeout de 5 s na
árvore limpa.

---

## 8. Riscos conhecidos

| risco | mitigação |
|---|---|
| mexer no `aero` e alterar **o Criador** | traje novo; hash do Aérion e da Amara no teste |
| ler igual à Nexara | grafite contra o branco dela; nenhum anel orbital |
| o visor nascer dentro da bochecha | cota medida na malha (`z ≳ 0,19`), não calculada |
| o emblema enterrado no tronco | cota medida (`z > 0,1114`), erro já cometido na Akemi |
| o relevo do cabelo amassar o crânio | guarda de elipsoide `1,05·R × 1,12·R × 1,15·R`, herdado |
| estourar o teto do LOD baixo | tudo corta menos o ∞; meta 6 600 contra 7 145,6 |
| representação do autismo virar estereótipo | ∞ da comunidade, nunca quebra-cabeça; abafador como ferramenta |

---

## 9. Publicação

PR exclusivo **"Haru 2.0 — Remasterização Oficial"**, com relatório em
`docs/VALIDACAO-HARU-2.0.md`.

**Não mesclar sem autorização expressa do Criador. A Maze não será
iniciada nesta etapa.**
