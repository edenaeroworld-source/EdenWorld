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

### O limite conhecido

A cobertura é completa até **65° de flexão de quadril**, com folga
sobre o que a locomoção pede (correr chega a 44,5°; pular, 35,5°).

Acima disso — sentar (85,9°) e subir escada (78,3°) — o joelho passa
da barra e aparece, como acontece com um vestido de verdade quando
alguém senta. Nesses dois estados a saia continua inteira e cai sobre
o colo, mas a cobertura não é garantida por teste: uma saia presa ao
osso do quadril não dá a volta num colo horizontal. Resolver isso
pede uma cadeia de ossos própria para a saia ou simulação de tecido,
e não foi feito aqui.
