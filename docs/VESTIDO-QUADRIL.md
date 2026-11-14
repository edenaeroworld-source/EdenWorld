# O vestido no quadril

Registro da correção da malha do vestido na região do quadril: o que
estava errado, como foi medido e o que garante que não volte.

## O defeito

O relato era de cortes e separações visuais no quadril — o vestido
parecia partido ao meio, com a esquerda solta da direita.

A investigação pedida cobriu, nesta ordem, as causas prováveis:

| Hipótese | Resultado |
| --- | --- |
| Vértices soltos ou duplicados | Não. Os anéis fecham com `% n` em `stitch`; não há coluna repetida na costura. |
| Faces faltando | Não. Toda aresta pertence a dois triângulos, exceto as duas bordas livres (barra e cintura). |
| Normais invertidas | Não (no código original). |
| Pesos de esqueleto incorretos | Não. Toda a saia pertencia ao osso do quadril. |
| Deformação independente de cada lado | Não. Sem osso de perna na saia, não havia como os lados divergirem. |
| Interseção entre corpo e roupa | **Sim.** |

A saia não estava rasgada: ela era **estreita demais**, e o corpo
passava por ela. Medido em repouso, com as proporções padrão:

| altura y | raio da saia | borda externa da coxa | folga |
| --- | --- | --- | --- |
| +0,030 | 0,1420 | 0,1812 | **−0,0392** |
| 0,000 | 0,1535 | 0,1827 | **−0,0292** |
| −0,030 | 0,1635 | 0,1843 | **−0,0207** |
| −0,060 | 0,1706 | 0,1834 | **−0,0128** |
| −0,090 | 0,1777 | 0,1815 | **−0,0037** |
| −0,120 | 0,1849 | 0,1795 | +0,0054 |

Até **3,9 cm de coxa atravessavam o tecido parado**, numa faixa de
12 cm. O que se via como "vestido partido" eram as duas manchas de
pele saindo pelos lados, uma em cada quadril, separando visualmente
as metades da peça.

### Por que a medida estava errada

A saia era descrita em múltiplos de `hipWidth` — o raio da **pelve**,
0,158 m. Mas na altura do quadril quem forma a silhueta não é a
pelve: são as **coxas**, que ficam a `legX` = 0,095 m do eixo e têm
raio próprio de 0,088 m, somando 0,183 m. A roupa foi dimensionada
contra a parte errada do corpo.

## A correção

1. **O perfil da pelve virou fonte única** (`PELVIS_PROFILE`). O
   tronco desenha esses anéis e a saia os consulta. Cópias separadas
   foi o que permitiu a roupa deixar de caber no corpo.

2. **A saia contém as formas que veste**, em vez de supor uma
   largura: a elipse da pelve e os dois discos das coxas. O encaixe
   dos discos é resolvido por amostragem (`swellFor`), porque uma
   elipse mais larga e mais funda que a coxa **ainda assim não a
   contém** — na diagonal ela é mais estreita, e a coxa em movimento
   está justamente na diagonal: larga em `x` porque fica a `legX` do
   eixo, adiantada em `z` porque a perna avançou. Era por essa quina
   que saíam os 2,7 cm restantes depois do primeiro acerto.

3. **Folga e acompanhamento são a mesma grandeza** (`followWeight` e
   `strideRoom`). A saia acompanha a coxa com peso que cresce da
   cintura (zero) para a barra (metade), e o espaço que reserva na
   forma é exatamente a parte do balanço que **não** acompanha. Sem a
   compensação, cobrir a passada exigiria uma barra de 78 cm — uma
   tenda; com acompanhamento total, a peça viraria calça.

4. **A costura dos dois lados** (`SEAM_BLEND`) mistura o peso em
   torno das colunas da frente e de trás, onde as metades se
   encontram. O peso varia de forma contínua e os dois lados
   concordam onde se tocam: a superfície continua inteira.

Nada foi escondido com luz, material ou câmera. A geometria mudou.

## Validação

### À vista

`docs/vestido-antes.png` e `docs/vestido-depois.png`, nove painéis
cada: parado de frente, de perfil e de costas; caminhando de frente e
de perfil; correndo de frente e de perfil; e o quadril torcido com as
pernas abertas, de dois ângulos.

    EDEN_RENDER=1 npx vitest run tests/unit/vestido-render.test.ts

O "antes" se regenera com o código anterior em árvore (`git stash`) e
`EDEN_VESTIDO_ANTES=1`.

### Por medida

`tests/unit/vestido-malha.test.ts`, com o instrumento em
`tests/helpers/cloth.ts`.

Saber se o corpo está dentro da roupa é mais escorregadio do que
parece. Comparar raios por setor angular erra sempre que a superfície
entre duas colunas está inclinada — o joelho que a comparação jura
estar de fora está coberto pelo triângulo entre as colunas. O teste
usa **paridade de raio** (Möller–Trumbore): lança-se um raio
horizontal e contam-se as travessias; ímpar, o ponto está dentro.

A paridade sozinha também erra, para o lado oposto: ela reprova a
perna que saiu **pela abertura da saia**, que é o que toda saia
permite. Por isso o defeito exige as duas respostas — fora do tecido
**e** radialmente além dele.

Cobertura verificada em 1 182 vértices de quadril e coxa:

- em repouso;
- em oito estados de movimento (`walk`, `run`, `jump`, `fall`,
  `swim`, `stairDown`, mais a abertura de pernas com o tronco
  torcido, em três intensidades);
- em cinco proporções extremas do editor de corpo;
- e o tecido não rasga na costura: nenhuma aresta passa de 2,4× o
  comprimento de repouso (medido: 1,61× caminhando, 2,07× correndo;
  sem a mistura da costura, 2,61× e 3,51×).

Mais a malha em si: peça única e conexa, sem vértice duplicado, sem
aresta não-manifold, com exatamente dois anéis de borda livre, e
normais para fora.

### O colo: quatro ossos no quadril

O limite acima era **65° de flexão**, e sentar pede 85,9°. Uma saia
presa a um osso só não dá a volta num colo horizontal — isso não se
resolve com mais peso, e três varreduras de `SKIRT_FOLLOW` (0,7, 0,85
e 1,0) confirmaram: nenhuma cobria sentar, e 0,85 ainda estragava a
corrida.

O que resolve é a saia ter ossos próprios. São quatro, presos ao
quadril, um por quadrante — esquerda, frente, direita, trás. Cada
vértice do pano se reparte entre o quadril e os **dois** quadrantes
vizinhos, com a fração de pano crescendo da cintura (costurada, segue
o quadril) até a barra (solta, segue os quadrantes).

Quem move os ossos é a pose, não um sinal de «sentou»:

    média = (coxa esquerda + coxa direita) / 2

Caminhando, uma perna vai e a outra vem, e a média fica em **0,000**
por mais larga que seja a passada — medido também em correr, nadar e
descer escada. Pular e subir escada chegam a 0,220. Sentar leva as
duas coxas juntas para 1,500. A média separa os dois mundos sozinha,
e por isso a regra vale igual para a jogadora, para as NPCs e para o
Panteão: todos passam pelo mesmo `Avatar.applyPose`, e ninguém
precisou ser avisado.

Sentada, cada quadrante faz uma coisa diferente:

| painel | o que faz | por quê |
| --- | --- | --- |
| frente | deita sobre o colo (0,6 da coxa) | é o pano que cobre a perna deitada |
| laterais | quase não giram (0,25), e se recolhem 0,25 rad para dentro | a saia de quem senta desce ao lado, não vai para a frente |
| trás | não gira: sobe 0,30 m e tomba 0,35 rad para a **frente** | para trás encostaria no espaldar, a 30 cm do centro |

E a saia inteira sobe 24 cm na barra, porque o assento empurra o pano
— é o que acontece com qualquer saia quando alguém senta.

### Por que a imagem decidiu, e não o número

A primeira versão punha os quatro quadrantes seguindo a coxa inteira.
As medidas ficaram ótimas: 32 vértices dentro da tábua, 53 de pele à
vista. E a saia virava um **balão** — um domo liso de frente, uma
lâmina rígida de perfil. Nenhuma sonda acusou.

O que mostrou foi desenhar o banco de verdade junto com o avatar, no
mesmo z-buffer (`drawProp`, em `tests/helpers/raster.ts`). A quarta
linha de `docs/vestido-depois.png` é essa prova: sentada de frente, de
perfil e de três quartos por trás, com a madeira no lugar onde o
motor a põe.

### O que fica medido agora

`tests/unit/vestido-banco.test.ts`, quatro testes:

- **nenhum vértice aparece por baixo do assento nem atrás do
  espaldar** — zero, contra 141 vazamentos sem o colo;
- o pano que entra na madeira fica **selado entre o corpo e a tábua**,
  onde nenhuma câmera chega: 51 vértices, contra 120 sem o colo;
- **sentada, o que o banco não esconde continua coberto**: 51 vértices
  de pele à vista, contra 181 sem o colo (e 73 sem a subida do
  assento). Descontam-se os que passam a olhar para a madeira ou para
  a coxa oposta, que o próprio corpo tapa;
- **levantar não dá tranco**: 10,6 cm no pior quadro, contra 9,0 cm do
  próprio corpo na mesma transição.

O banco não é copiado para dentro do teste: ele vem de
`benchGeometries()`, e a pergunta «está dentro da madeira?» é
respondida por paridade de raio. Se o banco mudar, o teste muda junto.

A cobertura é medida **pela normal da pele**, não radialmente a partir
do eixo do quadril. Com a coxa deitada, o pano que a cobre está
*acima* dela: um raio horizontal sai por baixo da saia sem tocá-la e
acusa pele nua onde a imagem mostra tecido. Foi por isso que `sit` e
`stairUp` continuam fora da varredura radial de `vestido-malha` — não
por serem casos perdidos, mas porque aquela régua não serve para eles.

### O limite que fica

Subir escada continua sem garantia de teste. Tentou-se um termo por
perna — o pano montando na coxa erguida — e, com o grupo de controle
correto, a medida disse que **piorava**: 366 vértices descobertos
contra 339. Foi removido. O primeiro grupo de controle estava
invertido (`RISE_FROM` acima de `RISE_TO` fixa o efeito em 1 em vez de
desligá-lo) e dizia o contrário; vale desconfiar de um controle que
melhora tudo de uma vez.
