# Escadas, saída e isolamento de cena

Marco K. Os prédios já existiam, já tinham dois e três andares nos
dados e já desenhavam degraus. O que não existia era **subir**.

Este documento registra o que estava quebrado de verdade — que não era
o que parecia — e o que foi feito.

## O diagnóstico, antes de mexer

A suspeita inicial era que os degraus fossem altos demais ou que a
colisão não os reconhecesse. Medindo, nenhuma das duas coisas era
verdade: o degrau tem 34 cm contra os 42 cm de altura de passo do
jogador, e os dez colisores do Mercado Éden estavam todos lá, pisáveis.
Num teste de cabeça-de-série o boneco subia os 3,40 m sem reclamar.

O problema eram cinco coisas diferentes, nenhuma delas "a escada é
alta demais".

### 1. A boca da escada ficava do lado errado

O guarda-corpo que impede a queda pelo vão do andar de cima deixa um
lado aberto: é por ali que se chega. O cálculo de qual lado abrir estava
invertido em relação ao sentido da subida. Resultado: o vidro ficava
exatamente em cima do último degrau.

Dava para subir a escada inteira e **não dava para pôr o pé no andar**.
A pessoa chegava ao topo, batia num vidro e voltava — que é precisamente
a descrição de "fico preso na escada".

A geometria da escada passou a ser lida de um lugar só, `stairFlight`,
que diz onde ela começa, para onde sobe e por onde se sai. Degraus,
corrimão, guarda-corpo e as pessoas que sobem leem todos daí.

### 2. Subir rápido devolvia a pessoa ao pé da escada

O corpo era teleportado para o topo do degrau de uma vez. Isso sacode a
câmera, e foi trocado por uma subida acompanhada. Só que, com um teto
fixo de velocidade, quem corria cruzava os 46 cm de piso do degrau em
dois ou três quadros e só ganhava 7 cm de altura: o degrau seguinte saía
do alcance do passo, o apoio sumia e a pessoa **despencava de volta para
o térreo**.

O orçamento de subida agora cresce com o quanto se andou no quadro. Num
degrau sobe-se 34 cm a cada 46 cm andados, então `andado × 1,6` sempre
cobre o próximo degrau, em qualquer velocidade. Andando, correndo ou
empurrado por uma parede, a escada funciona.

Descer ganhou o mesmo cuidado: um degrau para baixo é um passo, não uma
queda de 34 cm por quadro. O que passa da altura de passo continua sendo
apoio que sumiu de vez.

### 3. Havia móveis dentro do vão da escada

Nove peças, em dois prédios:

| Prédio | Peça | Onde estava |
|---|---|---|
| Mercado Éden | vaso, ilha de oferta | encravados nos degraus |
| Torre Zênite | vaso, vitrine | encravados nos degraus |
| Torre Zênite | rack, bebedouro, estante, poltrona, mesa de centro | boiando sobre o buraco da laje |

A laje dos andares de cima é vazada no vão para a escada passar. Um
canto de leitura inteiro do laboratório da Torre Zênite estava montado
em cima desse buraco. Todas as peças foram realocadas para espaço livre
do mesmo andar — nada foi apagado.

Um teste varre todos os prédios de mais de um andar e falha se qualquer
colisor de móvel encostar no vão.

### 4. A câmera não sabia o que era um andar

A trava que impede a câmera de afundar usava o relevo do terreno. Dentro
de um prédio o relevo é o chão lá fora, no meio do nada — a 4 km da
cidade, onde os interiores são montados. No primeiro andar a câmera
mergulhava pelo piso e mostrava o mercado visto de dentro do chão.

Duas defesas agora: a laje do andar barra a câmera (`blocksCamera`), e a
trava de altura passou a perguntar qual é o piso **sob o jogador**
(`PhysicsWorld.floorUnder`) em vez do relevo.

### 5. Sair não era uma decisão do jogador

A única saída era o interativo da porta, fixo a 1,2 m do piso térreo.
O alcance vertical do sistema de interação é de 2,4 m e o pé direito tem
3,40 m: **do primeiro andar a porta estava fora de alcance**. Quem subia
só saía descendo de novo e achando a porta.

A porta continua funcionando. Além dela, um botão **Sair do prédio**
aparece no canto inferior esquerdo enquanto se está dentro, e só
enquanto se está dentro. Ele some ao sair, ao viajar de região e ao
recomeçar o jogo. Nada acontece sozinho: estar perto da saída não tira
ninguém de lugar nenhum.

## Animação: andar é andar, escada é escada

A exigência era que o personagem nunca use a animação de escalar onde
deveria simplesmente andar.

A decisão não é tomada pelo tipo de colisor, e sim pela **inclinação
medida do chão sob os pés** — metros subidos por metro andado:

| Piso | Inclinação | Estado | O que se vê |
|---|---|---|---|
| plano | ≈ 0 | `walk` / `run` | caminhada |
| rampa do píer | ≈ 0,14 | `walk` | caminhada |
| escada | ≈ 0,74 | `stairUp` | joelho alto, peso à frente |
| escada, descendo | ≈ −0,74 | `stairDown` | passo curto, tronco recuado |

A camada de escada é aplicada **por cima** do ciclo de passada, com peso
proporcional à inclinação, e a passada continua governada pela distância
realmente percorrida. Uma rampa suave não aciona nada; no plano a pose
volta a zero. Entre uma coisa e outra a passagem é contínua — não há
troca brusca de animação.

## Gente que usa a escada

As pessoas de dentro dos prédios tinham um trajeto plano e uma única
altura. Agora um ponto de trajeto pode declarar o andar em que está, e o
trecho entre dois andares é uma subida de verdade: a altura sai da mesma
geometria dos degraus em que o jogador pisa, com o mesmo amortecimento,
e a perna sobe mais enquanto dura.

O Mercado Éden ganhou uma cliente que sobe para a galeria, dá uma volta
e desce.

## Isolamento

Já estava correto e continua pinado por teste: um prédio por vez, o
anterior liberado por inteiro — malha, luz e colisor —, o exterior
escondido enquanto se está dentro e devolvido ao sair, e a segunda
visita idêntica à primeira.

## O que ficou medido

34 testes novos em `tests/unit/interiores-escadas.test.ts`, todos
derivados de andar no prédio e olhar o que acontece, não de reler os
dados. Oito mutações foram injetadas no código de produção para conferir
que cada teste falha quando deveria: boca do guarda-corpo invertida,
orçamento de subida fixo, trava de câmera pelo relevo, laje transparente
para a câmera, pessoa que ignora a escada, ilha de volta ao vão,
animador sem camada de escada e motor sem estados de escada. Todas foram
pegas.

Suíte completa: 824 passando, 5 puladas. Verificação de tipos limpa.
Build em 532 ms.
