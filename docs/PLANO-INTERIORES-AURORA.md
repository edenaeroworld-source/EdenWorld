# Interiores de Aurora City — o prédio que não estava lá

> "Ao entrar em casas e prédios de Aurora City, o jogador encontra
> ambientes vazios, sem geometria. O personagem também apresenta um
> comportamento semelhante a estar nadando no vazio. Esse problema não
> acontece em Rosas Park."

O relato estava certo nos sintomas e a conclusão natural — "o sistema
de interiores de Aurora está quebrado" — estava errada. Não havia nada
de errado com Aurora, nem com os interiores dela. O que havia era uma
referência velha.

## O que realmente acontecia

Viajar de região **destrói o mundo e monta outro**: `World.dispose()`
seguido de `World.build()`, que cria uma `PhysicsWorld` nova em folha.
O motor reaponta o jogador para ela (`player.motor.setPhysics(...)`).

A camada de interiores, porém, nasce **uma vez** — na primeira porta
que alguém abre na sessão — e vive até o fim. E ela guardava a física
que recebeu no construtor. A partir da primeira viagem, essa física era
um objeto morto.

O primeiro prédio aberto depois de viajar subia inteiro no mundo
errado:

| | física morta | física viva (a do jogador) |
| --- | --- | --- |
| Paredes e piso | **75 colisores** | **0** |
| Modo interior (`setIndoor`) | ligado | **desligado** |

Com o modo interior desligado na física que conta, duas regras que
deveriam estar suspensas continuavam valendo para o jogador:

1. **O limite circular da região.** O interior é montado de propósito a
   4 km do terreno (`INTERIOR_ORIGIN`, em 4000, 4000). O teleporte para
   lá foi recortado de volta para dentro do círculo da região — medido:
   **o jogador parou a 5473 m do prédio**, na borda do mapa.
2. **O relevo.** Lá fora, naquele ponto, o terreno é fundo de oceano
   (−7 m em Aurora). Abaixo da linha de nado, que é −1,18 m.

Resultado: cenário externo escondido (como manda entrar num prédio),
nenhuma parede por perto, e o personagem boiando. **"Ambiente vazio" e
"nadando no vazio" são o mesmo bug, visto de dois ângulos.**

E a assimetria? Não era de Aurora. Era de **qualquer região aberta
depois de uma viagem**. Quem joga começa em Aurora, vai a Rosas, abre
um pavilhão lá (funciona — a cena acabou de nascer amarrada à física de
Rosas) e volta para Aurora, onde a primeira porta falha. Rosas parecia
a região boa porque foi a primeira a ser aberta, não porque fosse
diferente.

## A correção

A cena de interiores **não guarda mais a física: pergunta por ela**.

```ts
// Engine.ts
physics: () => this.world.physics,
```

E, porque desmontar tem de desfazer exatamente onde se fez, a cena
anota em que física montou o prédio aberto (`bound`) e é dela que
remove os colisores ao sair — mesmo que o mundo tenha mudado no meio.

Três reforços do mesmo tipo, no mesmo lugar:

- **O motor confere antes de entrar.** Se o prédio não subiu, ou se o
  modo interior não ficou ligado na física viva, a porta não abre e o
  jogador recebe um aviso. Antes, falhar em silêncio era o que produzia
  a tela vazia.
- **A opção `materials` foi removida da cena.** Ela não era usada e era
  uma referência do mundo — `World.dispose()` destrói esses materiais a
  cada viagem. Uma armadilha da mesma família, desarmada.
- **A cidade lá fora pausa enquanto se está dentro.** `setIndoor` faz
  *toda* consulta de chão responder "o piso do interior" e desliga o
  limite da região; os 54 habitantes, que reconsultam o chão a cada
  quadro, afundavam no andar do prédio e podiam caminhar para fora do
  mapa enquanto o jogador fazia compras. Invisíveis — mas voltariam
  errados.

## O Ateliê Aero

Com o bug resolvido, sobrou uma queixa verdadeira: o Ateliê Aero era o
único prédio de Aurora que ainda entregava o galpão cru. Três caixas
genéricas num salão de 14 × 10 m.

Ele ganhou acabamento próprio (`fitouts/AtelieAero.ts`): mesa de corte
no meio, araras de roupa, rolos de tecido, manequins, balcão com a
prateleira de pigmentos atrás, canto de espera, mesa de desenho — e a
cabine de prova ao lado, com espelho de três folhas na parede leste,
tablado, cortina e cabideiro. Luma atende, com o mesmo modelo oficial
que ela tem na rua.

| | antes | depois |
| --- | --- | --- |
| Malhas | 19 | **65** |
| Triângulos | 1 592 | **14 480** |
| Triângulos por m² | 8,0 | **72,4** |

Para comparação, os outros ambientes com acabamento ficam entre 28 e
100 triângulos por m².

### E os ambientes sem acabamento próprio

Agora todos os cômodos sem acabamento recebem uma passagem de
decoração (`InteriorDressing.ts`): tapete no meio, vaso e abajur nos
cantos, quadro na parede mais comprida e uma peça conforme a serventia
do cômodo — bancada na cozinha, canteiro na estufa, prateleira na
oficina. **Tudo encostado nas bordas**, porque circulação é o que o
teste de jogabilidade mede e decoração que tranca passagem é pior que
decoração nenhuma.

Isso beneficia os quatro interiores de Rosas Park e o de Bitnara sem
tocar em nada do que já existia lá.

## Estado de cada prédio

| Região | Prédio | Acabamento | Triângulos | tri/m² | Móveis |
| --- | --- | --- | ---: | ---: | ---: |
| Aurora | Ateliê Aero | próprio | 14 480 | 72,4 | 19 |
| Aurora | Mercado Éden | próprio | 34 600 | 80,1 | 68 |
| Aurora | Casa EdenPawl | próprio | 19 084 | 56,8 | 35 |
| Aurora | Torre Zênite | próprio | 21 528 | 99,7 | 58 |
| Aurora | Apartamento 12 | próprio | 7 160 | 28,8 | 26 |
| Aurora | Centro Éden Connect | próprio | 16 620 | 31,8 | 31 |
| Rosas | Casa de Chá | decoração | 4 276 | 14,8 | 12 |
| Rosas | Casa 7 | decoração | 5 148 | 12,6 | 16 |
| Rosas | Viveiro Éden | decoração | 3 096 | 7,8 | 9 |
| Rosas | Santuário | decoração | 2 476 | 7,7 | 5 |

**Aurora City está completa: seis de seis com acabamento próprio.** Os
quatro de Rosas Park são ambientes reais e caminháveis — casca
completa, piso, teto, janelas, luz, móveis e colisão —, mas continuam
mais rarefeitos que os de Aurora. Estão funcionando, e é trabalho que
ainda cabe fazer; não foi feito aqui porque o pedido era consertar
Aurora sem mexer na região que servia de referência.

## Os testes

**`tests/unit/interiores-viagem.test.ts` (15)** — o bug relatado, em
forma de teste. Monta as duas regiões de verdade, viaja entre elas e
exige que o prédio apareça em volta do jogador. Cobre entrar em cada um
dos 10 interiores vindo da outra região, caminhar nos quatro rumos
dentro de cada um (sem nadar, sem cair, sem atravessar parede) e sair.
Com a referência antiga, **13 dos 15 falham**; com a correção, passam
todos.

**`tests/unit/interiores-completos.test.ts` (42)** — a régua do marco I
aplicada a todos os prédios das duas regiões: volume mínimo (malhas,
triângulos, triângulos por m², móveis em que esbarrar), piso sem buraco
em toda a planta, teto, luz acesa, e inundação de 0,4 m a partir da
entrada alcançando mais de 45% de cada cômodo. Mais a auditoria vista
de fora: cada interior declarado tem porta na cidade, a porta está
dentro do limite da região, tem chão embaixo, cabe o corpo do jogador
na soleira, e o ponto de saída coincide com ela.

Suíte completa: **767 testes**, `typecheck` limpo, build em 652 ms.

## Verificação visual

**Não foi possível executar o jogo em navegador: esta máquina não tem
navegador nem WebGL, e não há como instalar um** (a rede permite só
alguns domínios de pacotes). Não há captura de tela do jogo rodando.

O que há é `tools/interiores-render.ts`: monta o interior com
exatamente o mesmo código que o jogo usa (`InteriorScene`), lê os
triângulos que saíram daquela montagem e rasteriza à mão, em isometria,
com o teto cortado. A geometria é a de verdade — se um cômodo estivesse
vazio, apareceria vazio.

- `docs/interior-atelie-aero.png` — o ateliê novo
- `docs/interior-apartamento-aurora.png`, `interior-zenite-recepcao.png`,
  `interior-edentech.png`, `interior-zenite-laboratorio.png`,
  `interior-edenstore.png`, `interior-edenstore-galeria.png`,
  `interior-edenpawl.png`, `interior-centro-connect.png` — Aurora
- `docs/interior-casa-de-cha.png` — Rosas Park, para comparar com a
  mesma régua
