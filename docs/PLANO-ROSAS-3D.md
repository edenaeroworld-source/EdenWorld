# Rosas Park em 3D, interiores e fauna

Marco H. Fecha quatro das lacunas que o plano do Universo Vivo deixou
abertas: a segunda região passa a existir como cenário, os interiores
ganham geometria, os bichos ganham corpo e o mundo deixa de ser
"Aurora City mais um banco de dados".

## O que mudou de conceito

### O mundo não sabe mais em que cidade está

Antes, `World` importava a planta de Aurora direto. Agora recebe um
**`RegionBlueprint`** e monta o que ele descreve: tamanho do terreno,
função de altura, zonas, paleta, habitats, áreas, raio da costa, ponto
de chegada e a função que constrói a cena.

Viajar entre regiões construídas é `dispose()` seguido de `build(outra)`.
Isso só é seguro porque **nada que o jogador conquistou mora no
`World`**: inventário, bichos, casa, missões, diário e salvamento vivem
no `UniverseSystem`. O mundo é cenário descartável; o universo persiste.

Consequência prática: uma terceira região não exige tocar em `World`.
Exige um `RegionBlueprint`.

### Uma região não é um nível

`WorldRegion.playable` continua dizendo a verdade sobre haver cenário
3D, e `cities/index.ts#hasScene` é a fonte mecânica dessa verdade. Há
teste que confere as duas afirmações uma contra a outra para todas as
regiões — inclusive as cinco que ainda não têm cenário.

### Interiores são dados, não código

Um interior é uma `InteriorDef`: cômodos, móveis, pessoas, saída.
`InteriorScene` monta qualquer um deles sem saber qual é — piso, teto,
paredes com vão de porta, móveis, luz por cômodo, colisão e um
interativo por móvel. Acrescentar um prédio visitável é acrescentar uma
entrada na lista.

O interior é montado em **(4000, 4000)**, longe do mundo, e o exterior é
apenas **escondido**, nunca descarregado. Entrar e sair é instantâneo, a
região continua simulando enquanto você toma chá, e a volta devolve o
jogador à porta, virado para fora.

A porta é um único interativo `'porta'` para os dois sentidos; quem
decide é `universe.interiors.isInside`. Em Aurora as portas são
**geradas**: `buildDoors` casa o `placeId` do interior com o lote do
prédio e põe a porta na fachada voltada para o centro. Um interior novo
ganha porta de graça.

### Bichos têm corpo, e o corpo vem da ficha

`buildCreature` lê `movement`, `size` e `colors` da espécie e monta o
animal: quadrúpede ganha quatro patas, cabeça e rabo; quem voa ganha
asas; quem flutua não ganha pernas; quem brilha recebe emissão. Não há
modelo por espécie — há regra por jeito de ser.

`WildlifeView` prende cada animal ao **seu** habitat (as âncoras vêm do
blueprint da região), respeita o orçamento de qualidade, some além da
distância de visão e foge de quem chega perto demais.

**Avistar é um fato do mundo.** Uma espécie entra no guia quando um
animal vivo é desenhado a menos de 18 m do jogador — nunca por abrir uma
tela. E a fauna é repovoada quando o período do dia vira: a coruja não
espera o jogador reiniciar a região.

### Quem é um habitante não depende de onde ele está

`NpcSystem.setRegion` reconstrói a malha de caminhada e respawna a
partir das mesmas sementes: nomes e perfis saem byte a byte iguais, só
as posições mudam. Divindades não são teletransportadas para regiões que
não são delas — fora de Aurora aparecem apenas os `patrons` da região.

## Rosas Park

520 m de terreno, 200 m de raio jogável, chão a 1,6 m, água a 0.

| Lugar | O que é |
| --- | --- |
| Roseiral | Três terraços concêntricos (46/34/22 m) e um mirante no centro |
| Paredão | A borda curva de um platô a noroeste — **encosta subível**, não parede |
| Três cascatas | Caem de afloramentos de rocha, 15 a 17 m, numa lagoa de espuma |
| Lago das Lontras | 52×38 m, com ilha, duas pontes e trilha ligando as duas |
| Jardins flutuantes | Três, que sobem e descem devagar; um tem rampa de vidro |
| Construções | Casa de Chá, Santuário, Viveiro Éden, Casa 7, Mirante das Águas |
| Nove marcos | Seis à vista; três escondidos, longe de qualquer caminho |

### O que a geometria custou a aprender

Cinco erros reais, todos encontrados por teste ou pela planta
rasterizada, nenhum por inspeção de código:

1. **Uma ilha no centro do lago entope o lago.** A ilha ficou
   deliberadamente fora de centro.
2. **O arco de um paredão tem de apontar para fora do parque.** Quando
   apontava para dentro, "dentro do arco" era mais baixo que fora — e o
   degrau virava uma cunha pontiaguda no meio do gramado. Hoje o terreno
   alto é um disco cujo centro fica fora da região.
3. **Cachoeira não se faz com relevo.** Com a encosta suave (para ser
   caminhável), a água caía morro acima: a crista e o pé estavam
   trocados. Crista e pé agora são funções explícitas, e o paredão
   vertical é geometria construída.
4. **Lote e calçada precisam do mesmo nível de projeto.** Com níveis
   separados, a porta ficava 3,4 m fora do pátio. Existe um único
   `designLevel`, e um `terraceLevel` separado para ele não se chamar em
   círculo.
5. **A saia do nivelamento de caminho aterra o que estiver perto.** A
   trilha da ilha estava enchendo o lago em volta dela. Dentro do
   contorno de um lago, a saia encolhe até a largura do caminho.

### A planta

`tools/mapa-rosas.ts` desenha `docs/rosas-park-planta.png` lendo a
**mesma** função de altura que o jogo usa — relevo sombreado, água por
profundidade, caminhos, pontes, construções e limite jogável.

Não é uma captura de tela do jogo. Esta máquina não tem navegador nem
WebGL; chamar isso de screenshot seria mentira. É um instrumento de
medida, e foi ele que mostrou a cunha do paredão que nenhum teste tinha
pegado.

## Como se chega a Rosas Park

Dois caminhos, os dois de verdade:

1. **Estação do Éden** — a construção de pedra com um arco e uma esfera
   girando. Há uma na Praça Central de Aurora City (a 157,5°, no mesmo
   anel do holomapa) e outra ao lado do portão de Rosas Park. Chegue
   perto e interaja: a lista de destinos abre direto.
2. **EdenPhone → Mapa do Éden** — a mesma lista, de qualquer lugar. O
   mapa da região também tem um atalho *Viajar para outra região*.

Rosas Park é conhecida desde o primeiro minuto (`initialRegions`), tem
rota direta a partir de Aurora City e `travelBlocker` devolve `null`:
não há nada a destravar.

Ao viajar, `Engine.enterRegion` desmonta o cenário anterior inteiro e
monta o novo a partir do `RegionBlueprint`. Você chega no portão do
parque — o ponto de chegada da região é o mesmo que o cenário usa para
nascer, e há teste que compara os dois para todas as regiões
construídas. A volta devolve o jogador **onde ele estava** em Aurora,
não na entrada.

O que atravessa a viagem: cristais, inventário, bichos, casa, missões,
avistamentos, diário e salvamento. Nada disso mora no cenário.

## Testes

Quatro arquivos novos, 65 testes:

| Arquivo | O que prova |
| --- | --- |
| `rosas-park.test.ts` | Planta, relevo e contratos da região: lago fundo, ilha emersa, caminho sem degrau, lote plano, limite que desce |
| `rosas-cena.test.ts` | A região **montada**: malha, colisão pisável e sólida, porta por interior, marco por ponto de interesse, cascata com som e luz, descarte completo |
| `interiores-3d.test.ts` | Malha, luz por cômodo, colisão, interativo por móvel, um interior por vez, descarte sem lixo, e que **todo** interior declarado monta |
| `bichos-3d.test.ts` | Corpo para toda espécie, anatomia conforme o movimento, habitat respeitado, orçamento de qualidade, animação, fuga e liberação |
| `rosas-npcs.test.ts` | Malha de caminhada: uma peça só, sem nó solto, fora d'água e das paredes, encostando na porta de cada construção e chegando à ilha |
| `viagem-regional.test.ts` | O destino existe, a rota existe, o ponto de chegada é pisável e bate com o do cenário, e ida/volta não perdem cristais, inventário, bicho, casa nem missão |
| `estacao-viagem.test.ts` | A Estação do Éden existe **nas duas regiões**, com piso pisável, luz e interativo; e a troca de cenário solta Aurora inteira antes de montar Rosas |

Quatro dos cinco erros de geometria acima foram **encontrados por esses
testes antes de qualquer execução do jogo**. O quinto foi encontrado
pela planta.

## Desempenho

Por desenho, não medido:

- Um interior por vez, liberação garantida por teste.
- Orçamento de fauna por nível de qualidade.
- Nenhuma região carrega cenário de outra; a troca libera tudo.
- O perfil de qualidade sobrevive à reconstrução da região.

**Não medido:** continua sem navegador nesta máquina. Quadros por
segundo em aparelho real seguem por medir, com `?bench` disponível.

## O que ainda não está pronto

| Item | Situação |
| --- | --- |
| Editor de decoração na tela | A lógica de colocar/mover/tirar está completa e testada; falta a interface |
| Objetos de casa que abrem telas | `Housing.interactables` identifica computador e console; falta ligar ao `EdenPhone` |
| IA de bicho de estimação no 3D | `PetManager` guarda estado e posse; o bicho ainda não segue o jogador desenhado |
| Cinco regiões sem cenário | Haru, Eden Aero e as outras continuam viajáveis como destino de dados |
| Multijogador | Fora do alcance, como nas etapas anteriores |
