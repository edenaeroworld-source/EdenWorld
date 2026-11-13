# Interiores vivos — Marco I

> Se o jogador pode entrar, o lugar precisa estar construído.

Este documento registra a auditoria dos interiores do EdenWorld, o que
estava errado, o sistema de construção que substituiu o antigo gerador e
o estado final dos cinco ambientes completos.

## 1. A auditoria

Antes de construir qualquer coisa, medimos o que existia. O resultado
não era bonito.

| Problema | Evidência |
| --- | --- |
| O jogador **nadava** dentro dos prédios | três causas independentes, abaixo |
| Andares inexistentes | Mercado Éden (galeria) e Torre Zênite (andares 1–2) tinham cômodos declarados e nenhuma geometria; `buildStairs` só criava uma placa escrita "escada" |
| Decoração simbólica | 6 dos 9 interiores tinham 3 ou menos objetos no térreo |
| Cômodos iguais com nomes diferentes | um `switch` de 7 verbos desenhava a mesma caixa para todo prop `comprar`, em qualquer loja |
| Portas para o nada | 18 referências `interiorId` em `Region.ts` contra 9 interiores registrados |

### Por que o jogador nadava

O `PlayerMotor` entra em modo natação quando os pés ficam abaixo de
`waterLevel − swimSubmersion`, isto é, abaixo de **−1,18 m**. Os
interiores são construídos longe do mapa, em `INTERIOR_ORIGIN
(4000, 4000)`, para poderem conviver com o exterior escondido. E aí
estava o problema — eram **três**, em camadas:

1. **O chão do mundo vazava para dentro de casa.** `PhysicsWorld.groundAt`
   caía no amostrador de altura da região quando nenhum colisor
   respondia. Em (4000, 4000) esse amostrador devolve **−7,00 m** em
   Aurora e **−9,00 m** em Rosas: bem abaixo da linha de natação. Até o
   piso do interior responder, o jogador estava nadando.
   *Correção:* `setIndoor(y)` fixa um piso lógico; estando dentro, o
   amostrador externo não é consultado.

2. **A fronteira do mapa puxava o jogador para fora do prédio.**
   `resolveCircle` prendia a posição ao `boundaryRadius` (268 m). O
   spawn interno (4007,2 / 4009,4) virava **(189,17 / 189,17)** no
   primeiro quadro — fora do prédio, dentro do mar.
   *Correção:* a trava de fronteira só vale ao ar livre.

3. **O teleporte fazia o mesmo, antes do primeiro quadro.**
   `PlayerMotor.teleport` tinha a sua própria cópia da trava. O jogador
   era arremessado para a borda do mapa antes mesmo de a física rodar.
   *Correção:* mesma condição — `!physics.indoor`.

As três estão ligadas ponta a ponta: `InteriorScene.load` chama
`physics.setIndoor(this.floorY)` e `unload` chama `setIndoor(null)`.

## 2. O sistema de construção

Nada disto é um plano invisível com textura. Cada peça é geometria real,
com colisor correspondente.

```
InteriorPalette   materiais compartilhados (vidro, cromo, gloss, neon, pele, tecido)
InteriorKit       Placement + InteriorBuild: at/box/cyl/sph/solid/walkable/lamp,
                  floor/ceiling/wall/window/door/step/light/interact/finish
InteriorShell     casca automática: percorre o perímetro de cada cômodo,
                  decide o que é fachada, divisória, janela ou porta;
                  escada real; fundo de cidade nas janelas
InteriorFurniture 37 móveis prontos (sofá, cama, geladeira, gôndola, caixa,
                  vitrine, aquário, viveiro, balcão, bancada, servidor…)
InteriorPeople    moradores e funcionários com caminhada por rota
fitouts/          a decoração de cada casa, uma por arquivo
InteriorScene     monta tudo, andar por andar, e desmonta sem deixar lixo
```

**A casca é derivada, não desenhada.** O perímetro de cada cômodo é
sondado a cada 25 cm. Onde há outro cômodo do outro lado nasce uma
divisória — construída uma só vez por par, com vão de passagem quando o
trecho comporta. Onde dá para a rua nasce fachada, com janela se o
trecho tiver 3,2 m ou mais. O peitoril é 0,95 m, ou 0,50 m na varanda.

> Um detalhe que custou caro: o classificador guardava apenas *se*
> havia vizinho, não *qual*. Uma parede de corredor encostada em duas
> salas virava um trecho só, ganhava uma porta só — e a segunda sala
> ficava lacrada, sem nenhum erro aparente. O teste de alcance pegou.

**Etiquetas de colisor** seguem um contrato que os testes verificam:
`interior:piso…`, `interior:parede:fachada…`, `interior:parede:divisoria…`,
`interior:parede:janela…`, `interior:movel:…`, `interior:degrau:…`.

**Escadas** são degraus de verdade: `round(3,4 / 0,34)` = 10 lances com
espelho, focos no nariz do degrau, corrimão cromado e guarda-corpo de
vidro com colisor nos três lados fechados. O vão no piso de cima é
recortado do retângulo do cômodo.

## 3. Os cinco ambientes

Cada um tem planta, materiais e gente próprios. Nenhum é o outro
repintado.

| Ambiente | Cômodos | Destaques |
| --- | --- | --- |
| **Apartamento 12 — Aurora** | sala, cozinha, corredor, quarto, banheiro, varanda | sofá, TV, mesa de centro, bancada com pia e fogão, geladeira, cama, guarda-roupa, luminárias, box, vista da cidade pelas janelas |
| **EdenTech** (Zênite, andar 1) | loja | vitrines dos dois lados, mesas de demonstração com notebooks ligados, quatro EdenPhones em pedestal, parede de telas, balcão de atendimento |
| **EdenStore** (Mercado Éden) | térreo + galeria | quatro corredores de gôndola com placas, padaria da Akemi, frios, ilhas de oferta, geladeiras, três caixas, carrinhos; na galeria, EdenHome e EdenGame |
| **Casa EdenPawl** | loja + sala de adoção | ração e brinquedos, aquários, viveiro, arranhador, banho e tosa, ilha de camas; quatro baias de adoção com o balcão do Saturno |
| **Centro Éden Connect** | recepção, espera, corredor, duas salas internas | guichês com fila organizada, bancos, totem, arquivo, escritório com estações de trabalho |

A Torre Zênite ainda ganha recepção (andar 0) e laboratório (andar 2),
que antes eram cômodos sem chão.

## 4. Como isto foi verificado

### Prova automática

`tests/unit/interiores-jogaveis.test.ts` — 40 testes. O principal faz
**inundação a partir da porta**: numa malha de 40 cm, usando o
`resolveCircle` e o `groundAt` de verdade, com o raio, a altura e o
passo reais do jogador, caminha a partir do spawn e marca onde dá para
ficar de pé. Depois exige que **cada cômodo** tenha pelo menos 45 % da
área alcançada. Um móvel em cima de uma passagem, uma porta que não
abriu, uma sala fechada — tudo isso derruba o teste. Foi assim que a
sala de registros do Centro apareceu lacrada.

Também verifica: contagem de triângulos, colisores de móvel, etiquetas
de piso/fachada/janela, iluminação, piso sem buraco (menos o vão da
escada, que é buraco de propósito, com degraus embaixo), um lugar em pé
a menos de 2,2 m de cada objeto interativo, descarregamento limpo,
espelho de degrau dentro do passo do jogador, população e impressão
digital distinta entre os cinco.

Suíte completa: **692 passaram, 5 ignorados**. `typecheck` limpo.
`build` em 475 ms.

### Prova visual

`tools/interiores-render.ts` monta cada interior com o mesmo código que
o jogo usa, lê os triângulos que saíram e rasteriza em projeção
isométrica, cortando o teto. As imagens em `docs/interior-*.png` são a
geometria de verdade: se um cômodo estiver vazio, ele aparece vazio.

**Isto não substitui ver o jogo rodando.** Esta máquina não tem
navegador nem WebGL — a validação visual em navegador pedida no item 9
do marco não pôde ser feita aqui e continua pendente de quem tiver uma
tela.
