# Validação visual do Character Remaster 2.0

Esta é a rodada que fecha o padrão dos personagens antes da reforma
das deusas. Tudo aqui foi conferido em **WebGL 2.0 de verdade**, na
bancada `lab.html`, que monta a cena com as peças reais do jogo —
`Avatar`, `Environment` (relógio, atmosfera, céu, sol, névoa e o PMREM
dos reflexos) e o mesmo mapeamento de tons. Uma bancada que iluminasse
diferente do jogo não validaria nada.

Contexto da GPU em todas as capturas:

```
WebGL 2.0 — ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)
perfis: baixa→baixa · media→media · alta→alta+pbr · ultra→ultra+pbr
```

`lab.html` **não entra no build**: o Vite só compila `index.html`.

## 1. Capturas

Todas em `docs/validacao/`, 1100 × 760, direto do WebGL.

| arquivo | o que mostra |
| --- | --- |
| `rosto-frente.png` | rosto de frente, `ultra` |
| `rosto-perfil.png` | o mesmo rosto de perfil, a 90° |
| `elenco.png` | cidadão, cidadã, cabelo longo, cabelo curto, Afters no máximo |
| `niveis.png` | os quatro níveis lado a lado, na mesma luz e no mesmo ângulo |
| `luz-noite.png` | o mesmo corpo às 22 h |
| `afters.png` | AfterBust® e AfterCurve® em 100% |
| `passo-1.png` … `passo-4.png` | quatro quadros do ciclo de caminhada |

## 2. O que a validação encontrou

Quatro defeitos reais, nenhum deles visível em `tsc`, em contagem de
vértices ou no rasterizador dos testes. Registro o método junto porque
ele vale mais que o resultado.

### A borda do nariz era uma superfície furando outra

Medido: na altura da base do nariz o crânio está em **0,937R** e o
anel da base da varredura chegava a **0,955R**. O nariz não estava
"mal encaixado" — ele atravessava a pele por dentro e reaparecia do
lado de fora. Afundar o anel esconderia a linha sem resolver nada,
porque continuariam sendo duas superfícies.

A correção é geométrica: o nariz passou a ser **a mesma malha do
rosto**. `SurfaceBuilder` ganhou `refine`, que subdivide a malha dentro
de uma bola decidindo **pela aresta e nunca pelo triângulo** (os dois
triângulos que dividem uma aresta fazem a mesma pergunta sobre os
mesmos dois vértices, então respondem igual e nenhum T aparece), e
`sculptFront`, que levanta a pele até um campo de altura com **máximo
suave**. Onde o nariz avança mais que o crânio, a pele sobe; onde ele
é mais fundo — a raiz, entre os olhos — nada acontece e o traço acaba
sozinho. Não existe junção porque não existem duas peças.

Depois: a ponta mede **1,187R**, o ponto mais à frente da cabeça
inteira, um quarto de raio além do plano do rosto.

### O granulado não era oclusão: era subdivisão linear

O primeiro render do nariz esculpido saiu manchado, em manchas do
tamanho de um vértice, confinadas à região refinada. Filtrei a oclusão
— continuou. **Zerei a oclusão inteira no navegador** (38.745 vértices
em 1) e as manchas continuaram: a causa era geometria.

Subdividir linearmente não acrescenta curvatura nenhuma: os vértices
novos caem sobre os triângulos antigos. Como a normal de um vértice é
a média dos triângulos que o cercam, e depois de subdividir todos eles
são coplanares, cada vértice passa a ter a normal da faceta em vez da
normal da curva — o rosto amanhece facetado. A correção é **tesselação
de Phong**: projetar o ponto médio nos planos tangentes dos extremos.

O filtro de oclusão ficou, porque é correto por conta própria: a
amostragem de três vizinhos por célula fica ruidosa justamente onde a
malha é localmente muito mais fina.

### As pálpebras estavam invisíveis desde o PR #24

Este é o defeito mais caro da rodada, e eu o diagnostiquei errado duas
vezes. As calotas das pálpebras eram geradas com a ordem dos vértices
ao contrário; com a face de trás descartada pelo culling, **não eram
desenhadas**. O globo inteiro ficava à mostra, e era isso — não o
tamanho do olho — a "bola de gude". Afinei a abertura três vezes
(1,15 → 1,32 → 1,40) mexendo num objeto que não aparecia.

O que fechou o diagnóstico foi medir uma coluna de pixels em vez de
olhar:

| ponto | antes | com `DoubleSide` |
| --- | --- | --- |
| topo do olho (466, 355) | `238 228 228` (esclera) | `240 191 148` (pele) |

Com as pálpebras realmente visíveis, a abertura voltou para 1,30/1,16.

### `baixa` estourou o orçamento de malha

Meu alvo de aresta para o refinamento era fixo em R·0,05 nos quatro
níveis. Como meta de aparência fazia sentido; como orçamento, não: em
`baixa` o nariz passava a concentrar **21% dos vértices do corpo
inteiro** e furava o teto do nível — um quinto do personagem gasto num
traço que, a 55 m de distância de detalhe, ninguém vê. O teste
`a malha baixa é mais leve que o avatar antigo inteiro` pegou isso.

O alvo agora é uma fração do próprio anel do nível. O nariz fica
sempre umas três vezes mais fino que o corpo ao redor, e nunca mais
fino que R·0,05, que é o que `ultra` precisa.

### E um erro meu de medição, que vale registrar

Concluí a certa altura que o nariz estava deslocado para cima. Não
estava: eu media com `cy = 0,685` quando o valor real é **0,700**. O
perfil foi reescrito em múltiplos de R — como o resto do rosto, que
fala em R desde sempre — e agora acompanha `headSize`.

## 3. Animação das criaturas

O ciclo rodado é o do jogo: `passoQuadrupede` foi extraída do
`WildlifeView` e é chamada pelos dois. Um ciclo reimplementado para o
teste validaria o teste, não o jogo.

Quatro quadros consecutivos, ângulos em radianos:

| quadro | quadris | joelhos |
| --- | --- | --- |
| 1 | `0,348 / −0,748 / −0,288 / 0,808` | `1,023 / 0,420 / −0,500 / −1,103` |
| 2 | `0,006 / −0,406 / 0,054 / 0,466` | `0,646 / 0,420 / −0,500 / −0,726` |
| 3 | `−0,455 / 0,055 / 0,515 / 0,005` | `0,420 / 0,701 / −0,781 / −0,500` |
| 4 | `−0,750 / 0,350 / 0,810 / −0,290` | `0,420 / 1,024 / −1,104 / −0,500` |

Três coisas se leem direto desses números:

**As diagonais estão em fase.** Descontando a pose de repouso (−0,20
nas patas da frente, +0,26 nas de trás), o quadro 1 dá balanço
**+0,548** nas patas 0 e 3 e **−0,548** nas patas 1 e 2. É um trote.

**Nenhuma articulação inverte.** O joelho da frente repousa em +0,42 e
só cresce (até +1,02); o jarrete de trás repousa em −0,50 e só desce
(até −1,10). `flexKnee` soma sempre no sentido em que a articulação
dobra e ignora valor negativo — um joelho que dobrasse para os dois
lados seria pior que nenhum.

**Não há salto.** A progressão é monótona e suave entre quadros
(0,348 → 0,006 → −0,455 → −0,750). O joelho satura no repouso durante
o apoio, que é o comportamento certo: ele fecha na recolhida e estende
no apoio, e é isso que tira o pé do chão em vez de arrastá-lo.

## 4. Iluminação

Conferido com o `Environment` do jogo, não com luz de bancada. Os
valores abaixo são pixels lidos das capturas, nos mesmos cinco pontos
nos dois horários, com a câmera no mesmo ângulo:

| ponto | dia (10 h) | noite (22 h) |
| --- | --- | --- |
| testa | `127 110 83` | `71 55 46` |
| bochecha | `132 118 90` | `73 56 49` |
| queixo | `128 120 86` | `71 55 42` |
| braço | `173 146 109` | `73 58 50` |
| perna | `203 167 125` | `74 58 51` |

- **Dia (10 h)** — a pele tem faixa larga, de `127` na testa sombreada
  pelo cabelo a `203` na perna ao sol. É essa diferença entre partes
  que dá volume; foi exatamente ela que o excesso de ambiente
  achatava antes do `e514bd4`.
- **Noite (22 h)** — `luz-noite.png`: céu estrelado, o vestido capta o
  frio do céu, a pele continua legível e quente contra ele. A faixa
  fecha para `71`–`74` em todo o corpo, que é o certo sem sol: sobra
  só o ambiente, e ele chega igual de todos os lados.
- **PMREM e reflexos** — ativos nos dois horários. O mapa de ambiente
  deixou de contribuir para a luz difusa da pele (essa parcela é da
  luz hemisférica) e ficou com o reflexo especular, que é o que dá o
  molhado do olho e o lustro do cabelo.
- **Sombras** — presentes e assentadas no chão em todas as capturas;
  nas de caminhada dá para ver o contato de cada pé.
- **Ângulos** — frente, perfil, três quartos e a órbita contínua do
  botão *Girar*. Nenhum deles revelou costura, buraco ou face
  invertida.

## 5. Desempenho por nível

Construção a quente (mediana de cinco, Node), e o quanto do corpo o
nariz consome:

| nível | vértices | triângulos | vértices no nariz | construção |
| --- | --- | --- | --- | --- |
| baixa | 4 263 | 6 118 | 355 (8,3%) | 37 ms |
| media | 6 935 | 10 694 | 545 (7,9%) | 44 ms |
| alta | 11 163 | 17 818 | 665 (6,0%) | 26 ms |
| ultra | 36 050 | 62 224 | 1 574 (4,4%) | 107 ms |

FPS medido no navegador, cinco avatares em cena:

| nível | FPS |
| --- | --- |
| baixa | 20,2 |
| media | 20,2 |
| alta | 21,0 |
| ultra | 20,9 |

**Esse FPS não serve para ranquear os níveis, e é desonesto apresentá-lo
como se servisse.** O SwiftShader é um rasterizador por software: o
custo é dominado pelo preenchimento de pixels, que é o mesmo nos
quatro níveis, então a malha quase não aparece na conta. O número
presta para uma coisa só — mostrar que nenhum nível trava ou cai. Para
comparar os níveis entre si, os sinais válidos são a contagem de malha
e o tempo de construção da tabela acima.

Erros de console: **nenhum**, em todas as capturas e em todos os
níveis.

## 6. O que ainda não está bom

- **O nariz lê fraco de frente.** A forma está certa e medida, mas com
  luz frontal e alta uma superfície lisa não produz terminador de
  sombra, e o traço quase some. Em perfil e em três quartos ele
  aparece. Resolver isso de verdade é dar ao nariz um sulco nasofacial
  mais fundo, não mais protrusão.
- **O olho ainda é grande para o rosto.** Com pálpebra visível ele já
  não é uma bola, mas a esclera continua generosa. Achei, olhando o
  perfil, que o globo estivesse furando a silhueta; fui medir e não
  está — na faixa de linhas que cruza o olho o primeiro pixel não-céu
  é sempre pele (x ≈ 409–417) e a esclera só começa 22 px para dentro
  (x ≈ 439). O problema é de proporção, não de interpenetração.
- **O pé dos bichos é uma cápsula.** Tem orientação e assenta no chão,
  mas não tem dedo nem casco.
- **Dedos só em `ultra`.** Em `alta` a mão continua uma pá.
- **As expressões faciais não foram tocadas.** Os seis morphs são os
  mesmos.
- **Não há capturas "antes" pareadas.** A bancada não existia no PR
  #24, e reconstruí-la naquele commit exigiria retroportar o próprio
  instrumento — o que tornaria a comparação suspeita. O antes/depois
  desta rodada está registrado em números medidos (0,937R contra
  0,955R; `238 228 228` contra `240 191 148`; 21% contra 8,3%), que
  para estes defeitos dizem mais que duas imagens lado a lado.

## 7. Portão

- `npx tsc --noEmit` — limpo.
- `npx vitest run` — **1 047 passando**, 11 pulados, 0 falhando. São os
  1 039 do PR #24 mais 8 novos: sete do refinamento (malha continua
  fechada, não mexe em quem já estava lá, respeita o alvo de aresta,
  nunca puxa a pele para trás, não inventa acabamento nem osso) e um
  das pálpebras.
- `npm run build` — 455 ms, `index-CvAbeQDV.js` 726,52 kB (240,00 kB
  comprimido).

O teste das pálpebras foi calibrado contra o defeito reinjetado: com o
winding invertido de volta, 288 dos 288 triângulos apontam para
dentro; sem ele, nenhum. Um teste que não falha com o bug de volta não
vale nada.
