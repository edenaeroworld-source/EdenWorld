# Marco J — Integridade dos personagens, colisão e alinhamento com o mundo

O problema era um só, com muitos sintomas: **os personagens não viviam
no mesmo mundo que o jogador**. O jogador andava sobre a física — o
estrado da praça, o tabuleiro da ponte, o degrau do mirante — e
esbarrava em árvore, banco e poste. Todos os outros andavam sobre o
relevo cru, uma superfície invisível que passa *por dentro* de tudo que
foi construído em cima dela.

Daí vinham o deus enterrado até o joelho, o habitante atravessando o
tronco, a Aurora flutuando em Rosas, o grupo de gente ocupando o mesmo
metro quadrado e o passeio que não saía do lugar.

## O diagnóstico, medido

Antes de mexer em qualquer coisa, as duas regiões foram montadas de
verdade (mesmo código do jogo, sem navegador) e medidas.

| Sintoma | Medida |
| --- | --- |
| Aérion enterrado na Praça Central | relevo 2,00 m × piso real **2,21 m** → 21 cm dentro do estrado |
| Lilly enterrada no Palco Aurora | relevo 1,70 m × piso real **2,60 m** → **90 cm** dentro do palco |
| Nós da rede de caminhada fora do chão | Aurora **37 de 348**; Rosas **8 de 150**, o pior com **88 cm** de erro |
| Maior vão relevo × piso em Rosas | **1,83 m** (tabuleiro de ponte) |
| Passeio de 2 minutos, semente 41 | andou 150 m e terminou a **13,8 m** do início — **9%** de aproveitamento |

Esse último número é o retrato do "não sai do lugar": a pessoa anda sem
parar e fica no mesmo quarteirão.

### Causas, uma a uma

1. **Ninguém consultava a física.** `CitizenSim` lia a altura direto do
   relevo. O jogador usa `PhysicsWorld.groundAt`, que enxerga o estrado.
2. **O `blocked` da rede só valia na hora de montá-la.** Depois disso,
   a pessoa seguia a linha reta entre dois nós, e o que estivesse no
   meio — um plátano plantado pelo paisagismo — era atravessado.
3. **Os deuses eram plantados no relevo cru**, inclusive os que moram
   sobre estrados.
4. **Deuses fora da região não eram escondidos de fato.** Ficavam com a
   interação desligada, mas o avatar continuava na cena — era a Aurora
   boiando no céu de Rosas.
5. **Ninguém se afastava de ninguém.** Não havia espaço pessoal.
6. **A Saturno do balcão não era a Saturno da rua.** O interior usava
   uma figura genérica de caixas.
7. **As rotinas só existiam em Aurora.** Os arquétipos pedem `praca` ou
   `mirante`; em Rosas esses nomes não existem, a busca falhava e o
   parque inteiro virava perambulação ao acaso.
8. **O empurrão de separação ficava represado.** Quem estava parado não
   o gastava; quatro segundos de conversa somavam 240 empurrões e a
   pessoa saía catapultada ao voltar a andar.

## O que foi feito

### `src/characters/CharacterGround.ts` (novo)

Uma resposta única para "onde é o chão" — a mesma para todo mundo que
não é o jogador.

- `settle(x, z)` procura o piso **a partir de cima da cabeça**, então
  um estrado ou um tabuleiro ganha do terreno que passa por baixo.
- `heightAt(x, z, feetY)` acompanha quem já está andando.
- `resolve(pos, feetY, radius)` é a mesma rotina de deslizar-ao-encostar
  que segura o jogador.
- `blocked(x, z)` e `segmentBlocked(a, b)` respondem sobre a linha reta.
- `corridorBlocked(a, b)` responde sobre **a passagem**, que é outra
  pergunta — veja abaixo.

### A poda da rede: corredor, não linha reta

A primeira versão cortava toda ligação cuja linha reta estivesse suja.
Resultado medido: **66 dos 348 nós de Aurora desapareceram** e o anel da
Praça Central foi cortado em 16 pontos — porque há postes de luz
plantados exatamente sobre ele, e os quatro acessos aos pátios dos
edifícios sumiram junto.

Mas uma calçada com um poste no meio **não é uma calçada fechada**. O
critério certo é: existe alguma faixa, num corredor de 1,5 m em volta
da reta, por onde um corpo passe? Com `corridorBlocked`, a poda caiu de
66 nós para **zero**, cortando só as duas ligações que de fato não têm
passagem. Desviar do poste é trabalho da direção em tempo real, não da
planta.

| | nós | ligações cortadas | componente |
| --- | --- | --- | --- |
| Sem poda | 348 | — | 348 |
| Poda por linha reta | 282 | 34 | 282 |
| **Poda por corredor** | **348** | **2** | **348** |

### `src/characters/CharacterModels.ts` (novo)

Uma fábrica só para os onze personagens oficiais: aparência canônica,
gestação, sombras. Rua e interior passam a pedir o avatar no mesmo
lugar, então a Saturno do balcão da EdenPawl é a Saturno da rua — mesma
altura, mesma roupa, mesmo rosto. `officialFingerprint(id)` resume a
identidade num número, e o teste trava os onze como distintos.

### Caminhada (`CitizenSim`)

- Destinos a **45 m ou mais**: ninguém sai de casa para ir até o poste.
- Olhar à frente antes do passo, e desvio por um dos lados — o lado
  escolhido é o que tem **mais espaço livre** (sondado a 0,7 / 1,4 /
  2,2 / 3,2 m), mantido por 2,4 s para a pessoa não tremer entre os dois.
- Diante de um banco comprido sem lado livre à vista, ela **anda rente
  a ele** até o fim, em vez de congelar.
- Travou mesmo assim: marca o trecho como ruim por 12 s e replaneja.
- `resolve` do corpo depois do passo, e a altura dos pés relida da
  física a cada quadro.

### O resto

- **`NpcSystem`**: `separate()` com 72 cm de espaço pessoal; deuses
  plantados com `settle`; deuses de fora da região **escondidos de
  verdade** (avatar, rótulo, aura e corpo), não só desinteragíveis.
- **`WalkNetwork`**: novo `edgeBlocked` nas opções.
- **`Engine`**: monta o `CharacterGround` da região e o troca junto com
  a cidade — a física antiga vai embora com a cidade antiga.
- **Interiores**: `PersonSpec.character` liga um morador a um
  personagem oficial; sem isso, cai na figura genérica como antes.
- **Rotinas**: cada região declara os seus lugares. Rosas ganhou oito
  (roseiral, ilha, quedas e os cinco pavilhões). Quando a rotina cita um
  lugar que não existe ali, ela é traduzida por um sorteio **estável
  por pessoa e período** — o hábito continua sendo hábito. Medido:
  **216 de 216** rotinas pegam em Rosas, espalhadas pelos oito lugares.

## Resultado

Passeio de 120 s, simulação pura, quatro sementes:

| Semente | Antes | Depois |
| --- | --- | --- |
| 1 | 191 m andados, 53 m de distância (28%) | 259 m, **146 m** (**56%**) |
| 7 | 123 m, 31 m (25%) | 138 m, **124 m** (**90%**) |
| 23 | 118 m, 20 m (17%) | 174 m, **154 m** (**88%**) |
| 41 | 150 m, 14 m (**9%**) | 150 m, **137 m** (**92%**) |

Custo: **0,48 ms por quadro** para 54 habitantes, com a separação e as
consultas de física ligadas.

## As imagens

Esta máquina não tem navegador nem WebGL, então **não há captura de
tela do jogo**. O que há é melhor para esta pergunta específica: a
região é montada com o mesmo código, os personagens são postos de pé
pelo mesmo sistema, e a geometria que sai disso é rasterizada à mão por
`tools/personagens-render.ts`. Se alguém estivesse enterrado, apareceria
enterrado.

Nos dois cortes a escala é real — um metro na vertical vale os mesmos
pixels que um metro na horizontal, senão a imagem provaria o que ela
mesma desenhou. A linha **verde** é o relevo cru; a **azul**, o piso que
a física devolve. Onde só se vê azul, as duas coincidem. A figura
**rosa** está onde a pessoa ficava antes; a **escura**, onde ela fica
agora.

- `personagens-praca.png` — Praça Central. Os 21 cm de Aérion.
- `personagens-ponte.png` — Rosas Park, o maior vão da região: 1,83 m.
  A figura rosa está com a cabeça na altura do tabuleiro.
- `personagens-rota.png` — Aurora em planta, o rastro de seis
  habitantes em 2 minutos. Em bege, os obstáculos sólidos; em cinza, a
  rede de caminhada podada.

## Os testes

`tests/unit/personagens-mundo.test.ts`, 18 testes, sobre as regiões
montadas de verdade:

- não atravessa árvore (fica a mais de 50 cm de um tronco de 50 cm) nem
  banco (nunca entra na caixa);
- contorna um banco atravessado no caminho e **chega do outro lado**;
- a rede podada não perde nenhum nó, continua inteira e nenhuma
  ligação sobrevivente está sem passagem;
- anda de verdade: mais de 80 m percorridos, aproveitamento acima de
  45%, mais de 12 quarteirões distintos em 3 min;
- a animação acompanha o deslocamento, e parado é parado;
- ninguém enterrado: habitantes a menos de 5 cm do piso e deuses a
  menos de 2 cm, nas duas regiões, a cada 37 quadros;
- Aérion acima do estrado, não dentro dele;
- Saturno idêntica em Aurora e em Rosas; onze impressões distintas;
  gestação da Amara preservada; ida e volta entre regiões sem deformar
  ninguém;
- as rotinas pegam em Rosas e são estáveis por pessoa e período;
- o empurrão de separação não se acumula durante a conversa.

Suíte completa: **710 testes**, `typecheck` limpo, build em 570 ms.

## O que não foi verificado

**A validação dentro do jogo, com WebGL, não foi feita** — não há
navegador neste ambiente. As medidas acima vêm da geometria e da física
reais, montadas fora da tela; elas provam posição, colisão e
identidade, mas não substituem alguém olhando a cidade rodando.
