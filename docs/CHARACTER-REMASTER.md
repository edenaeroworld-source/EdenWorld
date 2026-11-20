# Remaster dos personagens

Por que o rosto, os materiais e a oclusão ficaram como ficaram, e o
que ainda não está pronto.

## O ponto de partida

Não há um único arquivo `.glb`, `.gltf` ou `.fbx` no repositório. Os
personagens do Éden são inteiramente procedurais: `BodyBuilder.ts`
varre perfis, `BodySurface.ts` costura os anéis, `BodyRig.ts` dá os
ossos e `AvatarFace.ts` monta as peças do rosto. Isso decide quase
tudo o que vem a seguir. Não havia modelo para substituir — havia
código que desenha o corpo, e é o código que foi reescrito.

Tem uma consequência prática: **pipeline de asset não se aplica
aqui**. KTX2, Basis, Draco e Meshopt comprimem arquivos que o jogo
baixa; este jogo não baixa nenhum. Comprimir nada não economiza nada.
O custo dos personagens é de geração e de desenho, e é nesses dois
que o trabalho foi feito.

## O rosto

### Olhos

A pálpebra eram duas calotas esféricas concêntricas. Duas calotas só
se encontram quando as coberturas somam 180°, isto é, com o olho
fechado: de olho aberto os cantos ficavam escancarados e o globo
aparecia inteiro, como uma bola de gude pousada na cara. Alargar a
calota não resolve, porque o problema não é tamanho, é topologia.

A pálpebra passou a ser construída à mão, anel a anel, com a borda
variando conforme o ângulo:

    edge = π/2 − (π/2 − span)·|sin φ|

Nos cantos (`φ = 0`) a borda desce até o equador e as duas pálpebras
se encontram; no meio ela recua e abre a fenda. O resultado é uma
amêndoa, e a contagem de vértices **não depende da abertura** — é por
isso que a abertura pode ser um morph e a piscada é interpolação, não
reconstrução. Os cílios são a última fita de anéis da própria
pálpebra: um toro completo colocaria metade do anel dentro da cabeça.

### Lábios

Eram dois arcos de toro que, juntos, fechavam uma elipse. De longe
não era uma boca, era o contorno de uma boca — uma linha desenhada
com caneta. Agora são dois volumes, com o de baixo mais cheio que o
de cima (é essa diferença que impede o lábio de parecer carimbado), os
cantos enrolando para dentro e um vão escuro entre eles.

### O cânone

Adivinhar proporção a olho custou três ciclos de render sem acertar
nada. As medidas foram tiradas de uma referência e escritas no código,
em `FACE`, como frações do raio da cabeça: abertura do olho a 21% da
largura do crânio, íris a 45% da abertura, cantos internos separados
por uma largura de olho, boca a 33%, linha dos olhos a 48% da altura.

`FACE` existe por um motivo específico: a camada do rosto e o crânio
eram escritos com números independentes e **não se encontravam** — a
pálpebra ficava em `y = 0,222` e o topo do globo em `0,217`. Qualquer
coisa que toque os dois lados passa por `FACE` agora.

### Dois erros de posicionamento

O arco da sobrancelha é um pedaço de toro, e o centro do toro não é o
centro do arco: fica a um raio de distância. Sem descontar isso, a
sobrancelha subia `R·0,2` a mais e ia parar dentro do cabelo.

E a franja descia até a altura dos olhos. Um rosto sem testa não tem
onde pôr sobrancelha. Subiu para o terço de cima — continuando a
existir, porque faz parte do penteado e o penteado é identidade.

## Oclusão ambiente

A sombra de contato é assada na cor dos vértices, por nuvem de pontos:
para cada vértice, os vizinhos à frente da sua normal o escurecem,
tanto mais quanto mais perto. É o que dá sombra na órbita, sob o
queixo, na dobra do pescoço e por baixo da saia.

O valor é **normalizado pela quantidade de vizinhos**, e não somado.
Sem isso, a mesma pessoa escureceria ao se aproximar, porque a malha
densa tem mais vizinhos que a esparsa — o LOD mudaria a cor do
personagem. Com a normalização, `ultra` e `alta` medem 0,33 e 0,34 no
canto do olho contra 0,62 na bochecha.

O custo foi onde quase tudo deu errado primeiro, e as três correções
estão todas no código:

1. Todos contra todos, com 37 mil vértices, são 1,4 bilhão de pares.
   Daí a grade espacial.
2. A grade não bastou: a cabeça concentra dezenas de milhares de
   vértices num palmo, então uma célula lá dentro tem milhares, e
   varrer as vinte e sete vizinhas devolvia o custo quadrático
   localmente. A oclusão é um sinal de frequência baixíssima — três
   amostras por célula dão o mesmo número que doze (medido: 0,33 nos
   dois casos).
3. A amostragem tem de acontecer **ao montar** a lista de candidatos,
   não ao percorrê-la. Copiar as vinte e sete células inteiras para só
   então ler uma amostra é pagar a enumeração completa de novo.

E a vizinhança de vinte e sete células é propriedade da **célula**,
não do vértice: todos os vértices de uma mesma célula enxergam
exatamente a mesma lista. Montá-la uma vez por célula tirou um milhão
de consultas à tabela sem mudar um número.

Resultado: 827 ms → 98 ms numa malha `ultra`.

## Materiais PBR

O avatar inteiro sai num desenho só, com um material só. É bom para o
desempenho e era ruim para a aparência: a pele recebia o mesmo brilho
da borracha do tênis, e o olho o mesmo da camiseta. Partir a malha em
cinco materiais resolveria e custaria cinco chamadas de desenho por
personagem — com cinquenta habitantes em cena, é o orçamento inteiro.

A saída é um número por vértice, `aFinish`. Cada parte do corpo
declara o seu acabamento antes de ser varrida. Onde uma varredura
atravessa materiais — o braço vai da manga ao pulso nu e à mão, a
perna da calça ao tênis — a estação herda o acabamento da cor que já
declarava, que é onde a intenção estava escrita.

| superfície | rugosidade | metal | por quê |
|---|---|---|---|
| pele      | 0,58 | 0,00 | difusa, realce largo e fraco |
| tecido    | 0,88 | 0,00 | quase sem realce, com brilho de borda |
| cabelo    | 0,42 | 0,08 | realce alongado — é o que dá o lustro |
| olho      | 0,08 | 0,00 | molhado, com verniz por cima |
| borracha  | 0,72 | 0,00 | fosca, um pouco mais que tecido |
| brilhante | 0,22 | 0,55 | fivelas e enfeites |

O mundo já mantinha um PMREM do céu vivo em `scene.environment`, e o
resto do cenário o lê entre 1,25 e 1,8. O avatar lia com 1, o que o
deixava mais fosco que tudo à volta; agora lê com 1,15. Como a
rugosidade passou a variar por fragmento, é esse mapa que dá o reflexo
— o olho reflete o céu e a camiseta não.

## ULTRA, HIGH e MOBILE

Não foi criado um sistema novo: `QualitySystem` já tinha quatro níveis,
vinte campos de perfil e detecção de dispositivo. Ganhou dois campos.

| perfil | malha | material |
|---|---|---|
| ULTRA  | `ultra` | físico completo |
| HIGH   | `alta`  | físico completo |
| MOBILE | `media` / `baixa` | sem brilho de tecido nem verniz |

`ultra` existia no enum e **não era alcançável por ninguém**:
`NpcSystem.detailFor` parava em `alta`. Agora chega — mas só a um
terço da faixa de detalhe, porque a malha `ultra` custa perto de cem
milissegundos para montar e dar isso à multidão inteira trocaria um
engasgo por cinquenta. A histerese de 15% ganhou o degrau novo.

Uma correção de rota que vale registrar: `alta` tinha sido engrossada
de 20 para 30 segmentos. Quem roda em `alta` é a máquina mediana, e
isso triplicou o custo de montar um corpo — de 13 ms para 40 ms — sem
que ninguém tivesse pedido. Voltou ao que era. O ganho de **forma**
(órbita, lábio, oclusão) não custa vértice e vale para todos os
níveis; o que custa vértice fica em `ultra`.

## Bichos

O corpo de todo bicho era uma cápsula: um cilindro de raio constante
com duas meias-esferas. Nenhum animal tem raio constante — o peito é
mais largo que a cintura, a garupa é mais alta que o ombro, e é essa
variação que separa um bicho de um comprimido. Agora é uma varredura
de perfil, que custa os mesmos vértices e aceita qualquer silhueta.

Dois detalhes que mudaram a leitura: a frente do tronco não afina até
virar bico (termina na base do pescoço, larga o bastante para a cabeça
assentar sem degrau), e quem não rasteja ganhou pescoço. Sem essas
duas coisas o bicho lia como dois caroços encostados.

Os bichos também não tinham nível de detalhe nenhum: todos nasciam com
a mesma contagem de gomos. Agora seguem o mesmo perfil de qualidade
dos personagens, via `CREATURE_DETAIL`.

## A bancada de WebGL, e os dois erros que ela achou

A lista abaixo dizia "nada disto foi visto rodando". Agora foi:
`lab.html` monta a cena com as peças reais do jogo — `Avatar`,
`Environment` (relógio, atmosfera, céu, sol, névoa e o PMREM dos
reflexos) e o mesmo mapeamento de tons. Uma bancada que iluminasse
diferente do jogo não validaria nada. Ela não entra no build: o Vite
só compila `index.html`.

O primeiro quadro em WebGL mostrou a pele esverdeada, e nenhum dos
dois motivos aparecia no rasterizador, que é um sombreador difuso sem
PBR.

**A oclusão estava no albedo.** Oclusão ambiente mede quanta luz do
céu chega a um ponto; não tem nada a dizer sobre o sol, que vem de
uma direção só e ou bate ou não bate. Multiplicá-la na cor apagava as
duas juntas. Agora vai num atributo próprio e entra onde o Three.js
aplicaria um `aoMap`, sobre a parcela indireta.

**O ambiente estava sendo contado duas vezes.** A cena tem luz
hemisférica *e* um PMREM do próprio céu. Para o avatar é o mesmo
ambiente somado duas vezes, e a segunda vem tingida de verde porque a
captura inclui o chão. O queixo saía 158/162/134 — verde acima do
vermelho, numa pele cujo albedo tem o vermelho 58% acima do verde. A
parcela difusa ficou com a luz hemisférica; ao mapa sobrou o reflexo
especular, que é o que dá o molhado do olho.

O método vale mais que o resultado: desligar um termo por vez na cena
viva e medir o pixel. Cuidado com dois enganos que custaram tempo —
trocar a cor da luz hemisférica de fora não faz nada (o `Environment`
reescreve a cor todo quadro), e uma impressão a olho ("está verde")
pode ser desaturação, não matiz.

## O que não está pronto

Ser honesto sobre isto é mais útil que a lista do que foi feito.

- **Dedos só em `ultra`.** Em `alta` a mão continua uma pá. É
  deliberado (custa um quinto), mas é uma pá.
- **A base do nariz ainda mostra uma borda.** A varredura do nariz é
  uma superfície separada que atravessa a do crânio; o filtro
  disfarça o encontro, não o resolve. A solução de verdade seria
  costurar as duas malhas.
- **As expressões faciais e a animação de corpo não foram tocadas.**
  Os seis morphs continuam os que já existiam.
- **O pé dos bichos é uma cápsula.** Tem orientação e assenta no
  chão, mas não tem dedo nem casco; de perto, é um pé genérico.
- **A validação é por imagem parada.** A bancada gira o modelo e eu
  conferi poses de repouso, mas o ciclo de caminhada dos bichos foi
  verificado pela matemática da fase, não quadro a quadro em vídeo.
