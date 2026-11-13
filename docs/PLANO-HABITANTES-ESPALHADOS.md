# Os habitantes debaixo da árvore — por que a cidade virou fila

> "Após o último PR, os NPCs em Aurora City estão todos concentrados
> próximos à mesma árvore. Uma cidade viva não é uma fila de NPCs
> debaixo de uma árvore."

O relato estava certo, e a causa não era o sorteio de destinos nem a
rotina: era **geometria**. Quatro pontos da rede de caminhada do anel
da Praça Central caíam **dentro dos canteiros** — aqueles vasos de
pedra de 2,4 m de raio com uma árvore em cima. Quem era mandado para
um deles encostava na borda e ficava ali, empurrando a pedra, para
sempre. O resto da cidade continuava andando; só que a cada minuto
mais alguém era sorteado para um desses quatro pontos e nunca mais
saía. A fila debaixo da árvore era um **ralo**, não um ímã.

## Como quatro buracos passaram despercebidos

O planejador perguntava "este ponto está livre?" medindo a colisão **na
altura do próprio ponto**. Em cima de um canteiro de 50 cm, nada
colide — a resposta era *livre*. O corpo que anda, porém, chega pelo
piso da praça (`PLAZA_Y = 2.16`) e bate na parede de 50 cm, que é mais
alta que o degrau que ele sobe (42 cm). Livre para quem planeja,
intransponível para quem anda.

Medido, em metros do centro de cada canteiro:

| nó | posição | distância ao centro do canteiro | `blocked` planejando | `blocked` andando |
| --- | --- | --- | --- | --- |
| #8 | (−15.3, 32.5) | 2,05 m | não | **sim** |
| #11 | (−33.4, 13.2) | 1,26 m | não | **sim** |
| #14 | (−33.4, −13.2) | 1,26 m | não | **sim** |
| #17 | (−15.3, −32.5) | 2,05 m | não | **sim** |

Teste de armadilha (rede de dois nós, 90 s de simulação): cada um dos
quatro habitantes parou a **2,74 m** do centro do canteiro — a parede
está a 2,72 m —, com velocidade 1,07–1,16 m/s. Andando com toda a
vontade, 70 cm a 1,50 m curto do destino, para sempre.

E a árvore da foto é exatamente isso: a árvore que nasce no canteiro.

## Os três agravantes

A armadilha explicava o acúmulo. Mais três coisas faziam a cidade
parecer menor do que é:

1. **Cada um sorteava sozinho.** Ninguém sabia para onde os outros
   estavam indo, então destinos repetidos aconteciam por acaso.
2. **`setRoutine` mandava todo mundo para o mesmo lugar.** A rotina diz
   "de manhã, praça"; a praça virava *um* ponto, o mesmo para todos os
   habitantes daquela rotina.
3. **A separação só valia para quem estava na tela.** `separate()`
   percorria os ≤18 habitantes desenhados. Os outros 36 podiam se
   atravessar à vontade e saíam do fundo já empilhados.

## O que foi feito

Nada de desligar colisão, nada de apagar canteiro. **O cenário ficou
onde estava; o caminho é que desviou.**

### 1. Perguntar da altura certa — `CharacterGround.reachableFrom`

```ts
reachableFrom(x, z, fromX, fromZ, radius = this.radius): boolean {
  return !this.blocked(x, z, this.settle(fromX, fromZ), radius);
}
```

Julga o ponto a partir da altura de **quem chega**, não da altura do
próprio ponto. É por isso que os decks das pontes de Rosas (88 cm acima
do terreno) continuam válidos: quem chega já vem por cima da ponte.

### 2. Mudar o nó de lugar, não apagá-lo — `WalkNetwork.placeNode`

A rede ganhou a opção `pointBlocked`. Quando um nó cai num lugar onde o
corpo não chega, a construção procura um substituto em anéis de 1,3 /
2,6 / 3,5 m, 12 ângulos cada, e fica com o primeiro que o corpo
alcança. Só se nada servir o nó é descartado.

| | antes | depois |
| --- | --- | --- |
| aurora-city — nós | 318 | **318** |
| aurora-city — arestas | 391 | **392** |
| aurora-city — **inalcançáveis** | **6** | **0** |
| aurora-city — nós realocados | — | 6 (deslocamento máximo **2,60 m**) |
| rosas-park — nós / arestas | 144 / 219 | **144 / 219** |
| rosas-park — nós de ponte | 5 | **5** |

Nenhum ponto de passagem foi perdido em nenhuma das duas regiões.

### 3. Um quadro de destinos — `src/npc/DestinationBoard.ts`

Um contador de "quantas pessoas estão indo para este nó", com
`claim` / `release` / `leastBusy`. Quem vai escolher destino sorteia
**10 candidatos** e fica com o menos disputado; empate se resolve no
sorteio, para a ordem da lista não virar preferência. A reserva é
devolvida na chegada — e a reserva e a devolução acontecem num lugar
só (`setDestination`), senão um vazamento faz um ponto vazio parecer
lotado para sempre.

`setRoutine` passou a usar o mesmo quadro: "de manhã, praça" agora
escolhe entre os nós **dentro** da praça, o menos disputado deles.

### 4. Saída de emergência — banimento temporário

Se alguém tenta duas vezes (`STUCK_RETRIES`) chegar a um nó e não
consegue, aquele nó entra na lista pessoal de banidos por 45 s
(`BAN_SECONDS`) e a pessoa escolhe outro. É a rede de segurança para
qualquer armadilha que ainda apareça num cenário futuro: ninguém fica
preso, mesmo que o mapa esteja errado.

### 5. Separação para a cidade inteira

`separate(everyoneSteps)` agora percorre os **54** habitantes (1431
pares, ~10 µs), mas só empurra quem deu passo naquele quadro — quem
está fora da tela anda a cada 4 quadros, e empurrar alguém parado o
catapulta.

## O resultado, medido

Simulação de **40 minutos** de relógio do jogo (dia de 24 min), mesmo
seed, antes e depois:

| | antes | depois |
| --- | --- | --- |
| encostados nos canteiros, minuto 1 | 4 | 1 |
| minuto 8 | 9 | 0 |
| minuto 16 | 13 | 5 |
| minuto 24 | 15 | 3 |
| minuto 40 | **16** | 2 |
| **pico em 40 min** | **16 / 54** | **9 / 54** |
| maior grupo em 5 m (pico) | 7 | **5** |
| células de 20 m ocupadas | 33–41 | 35–41 |

Antes a conta **subia** — era um ralo, e o ralo não devolve ninguém.
Depois ela **oscila entre 0 e 5**: gente que passa pela praça,
conversa e vai embora. É o que uma praça deve parecer.

Os 120 s pedidos, registrados pelo teste, em Aurora:

```
t= 10s  maior grupo 5 m= 2  células 20 m=44  raio médio=109 m
t= 40s  maior grupo 5 m= 2  células 20 m=38  raio médio= 97 m
t= 80s  maior grupo 5 m= 3  células 20 m=35  raio médio= 89 m
t=120s  maior grupo 5 m= 5  células 20 m=35  raio médio= 87 m
```

E em 240 s: **29** chegadas seguidas da escolha de um novo destino, e
**49 dos 54** habitantes passaram por dois destinos ou mais.

## As imagens

- `docs/habitantes-antes.png` — 12 minutos com o código anterior:
  **13 dos 54** encostados nos canteiros.
- `docs/habitantes-aurora.png` — 12 minutos com a correção, mesmo seed:
  **3 dos 54**, e eles mudam.
- `docs/habitantes-praca.png` — o anel de perto: em vermelho os nós que
  caíam dentro do canteiro, em verde para onde foram, em amarelo onde
  parava quem era mandado ao ponto vermelho.

**Estas imagens não são capturas de tela do jogo.** Esta máquina não
tem navegador nem WebGL; o que elas mostram é a geometria e a
simulação de verdade, rasterizadas à mão fora da tela
(`tools/habitantes-mapa.ts`). Elas provam onde os habitantes **estão**
— não provam como a cena **parece**. Para isso é preciso abrir o jogo
num navegador com WebGL2.

## Testes

`tests/unit/habitantes-distribuicao.test.ts` — 23 testes:

- toda a rede de caminhada é alcançável a pé, nas duas regiões;
- nenhum ponto de passagem dentro de um canteiro; o canteiro continua
  no lugar (colisor por colisor); as pontes de Rosas continuam na rede;
- os 54 nascem espalhados, cada um com o seu destino;
- 120 s registrados nas duas regiões, com grupo máximo, células
  ocupadas e raio médio;
- ninguém empilhado em cima de ninguém;
- 12 minutos de Aurora sem roda de gente em volta da árvore;
- quem chega escolhe outro destino e sai de lá;
- todo mundo anda de verdade;
- o quadro de destinos, unidade por unidade;
- as correções da PR #12 continuam de pé: ninguém enterrado no chão,
  rede inteira, ninguém atravessa canteiro, separação fora da tela.

Dois testes foram verificados por mutação: desligar `pointBlocked`
derruba 2 deles; desligar o banimento derruba 3.

Suíte completa: **790 testes, 42 arquivos** (eram 767 / 41).
`typecheck` limpo, `build` em 529 ms.
