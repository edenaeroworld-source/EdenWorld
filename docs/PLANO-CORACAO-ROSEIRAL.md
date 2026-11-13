# Coração do Roseiral — bloqueio permanente de área

O miolo de Rosas Park virou área proibida: ninguém entra, ninguém
atravessa, ninguém é posicionado lá dentro. A estrutura continua
inteira e visível.

---

## Uma nota sobre o nome

O pedido fala em **Coração da Rosaniana**. Esse nome não existe no
código. A estrutura central de Rosas Park chama-se **Coração do
Roseiral** (`coracao-roseiral`), no centro do Roseiral Maior, em
(0, −24): o mirante de piso de vidro sob uma pérgula de seis arcos
brancos, com luz própria. É a estrutura descrita — cristalina,
iluminada, elemento central do parque — e é sobre ela que esta
correção age. Se houver outra estrutura em mente, o mecanismo criado
aqui a cobre com uma linha de declaração.

---

## A causa, medida

Antes da correção, Suki-Chan estava em **(0,000; −24,000)** — o centro
exato da estrutura, a **zero metro** dela. Saturno ocupava o mesmo
ponto antes. Duas metades somadas:

**1. O ponto oficial do Roseiral Maior é o centro do Coração.** Em
`Region.ts`, o lugar `roseiral-maior` tem coordenadas (0, −24), que
são as do `ROSE_GARDEN`. Quem o posicionamento mandasse para o
Roseiral Maior nascia dentro do mirante.

**2. Nada verificava o ponto, e não havia o que verificar.** O
`settlePlacement` só consultava obstáculos **no anel de desempate** —
que nem chega a rodar quando ninguém mais disputa o lugar. O ponto
entrava como veio. E ainda que consultasse, o piso do mirante era um
colisor **caminhável** (`walkable: true, solid: false`): um chão em
que dava para pisar.

Por isso trocar quem recebe o lugar não resolve — a vez passa para o
próximo da fila, e foi literalmente o que aconteceu entre Saturno e
Suki-Chan. O que faltava era o conceito de **área que ninguém ocupa**.

---

## A correção

Um módulo novo, `src/world/KeepOut.ts`, define uma zona proibida como
dado: centro, raio, altura. A zona é declarada **uma vez** e passa a
valer em quatro camadas ao mesmo tempo.

| Camada | O que acontece | Onde |
|---|---|---|
| **Física** | Vira um cilindro sólido, não caminhável, 6 m acima do terreno e 2 m enterrado | `CityContext.sealKeepOuts` |
| **Navegação** | Nenhum ponto de passagem cai dentro; nenhuma ligação atravessa | `WalkNetwork.buildWalkNetwork` |
| **Posicionamento** | O ponto pretendido é empurrado para fora **antes** de pousar | `NpcSystem.settlePlacement` |
| **Conferência** | A validação da viagem reprova quem estiver lá dentro | `RegionTransition.checkRegionIntegrity` |
| **Rede de segurança** | A cada quadro, quem tiver entrado é devolvido para fora | `NpcSystem.enforceKeepOuts` |

Nenhuma das cinco cita um personagem pelo nome — há um teste que
verifica isso lendo o próprio código. A regra vale para o jogador, os
54 habitantes, os 11 integrantes do Panteão e quem for criado depois.

### O caso que o bug produziu

Suki-Chan estava no centro **exato**: distância zero, sem direção
radial para calcular. A conta do empurrão daria `0/0`. O módulo escolhe
um rumo fixo (+X) nesse caso, o que mantém o resultado estável — a
mesma entrada dá sempre a mesma saída, e a região monta igual em toda
carga. Suki-Chan agora fica em **(13,2; −24,0)**: 1,2 m fora da borda.

### Altura da barreira

O pulo do jogador sobe `v²/2g = 8,3²/48 = 1,44 m`. A barreira tem 6 m
acima do ponto mais alto do terreno sob o disco. A relação entre as
duas é afirmada num teste, então mexer em `jumpSpeed` acusa o problema
em vez de abrir a estrutura em silêncio.

---

## O que **não** mudou

A estrutura é a mesma. O disco de vidro, os seis arcos da pérgula, o
foco de luz de raio 26 e as bolhas luminosas continuam exatamente onde
estavam — o que saiu foi só o colisor caminhável do piso, substituído
pela barreira. O colisor não tem malha: nada novo é desenhado.

A barreira deriva centro e raio do próprio `ROSE_GARDEN`, sem números
copiados, então tem a forma e o tamanho do que protege e acompanha
qualquer mudança futura na planta.

**Uma coisa se moveu, e de propósito.** A placa do marco "Coração do
Roseiral" ficava em (0, −24), com alcance de 3 m. Fechada a estrutura,
ela seria uma placa que ninguém pode ler. Ela passou para a borda de
fora (3,4 m da barreira), que é de onde se olha a estrutura de qualquer
forma. A regra é geral: qualquer marco que caia dentro de uma zona é
levado para fora, em vez de virar conteúdo inalcançável.

---

## Como isto está verificado

`tests/unit/coracao-roseiral.test.ts` — **34 testes**, na região montada
de verdade, com física, vegetação e colisão.

Os oito testes pedidos:

1. **Caminhar contra a estrutura por direções diferentes** — oito rumos,
   um teste cada, 22 m de distância e 8 s de caminhada reta ao centro.
2. **Atravessar correndo** — os mesmos oito rumos, correndo, 30 m de
   impulso. Mais dois casos: um quadro de 100 ms (celular em apuros,
   onde um corpo atravessaria uma parede entre dois quadros) e pulos
   repetidos contra a barreira.
3. **NPCs contornam sem atravessar** — nenhum ponto de passagem dentro,
   nenhuma ligação cruzando, e existe rota de um lado ao outro do
   roseiral sem entrar.
4. **Nenhuma deusa dentro** — varredura de todo o panteão ativo.
5. **Suki-Chan, Saturno e Maze em particular** — teste nominal, porque
   é a regressão relatada.
6. **Viajar Aurora↔Rosas várias vezes** — cinco idas e voltas, com a
   conferência de integridade rodando a cada chegada.
7. **Recarregar** — a região é montada do zero três vezes; a barreira
   nasce da planta, não do save.
8. **Nenhuma rotina nem spawn usa o interior** — ninguém nasce dentro, e
   dois minutos de vida do parque com o relógio do jogo (as rotinas
   trocam de período e todo mundo escolhe destino novo) não levam
   ninguém para lá.

Mais: a preservação visual medida na geometria (contagem de vértices do
piso de vidro e da pérgula dentro do miolo), a placa ainda legível de
fora, a ausência de exceções por nome no código, e a aritmética da zona
isolada.

### Os testes foram testados

Treze regressões injetadas, uma por vez, cada uma desfeita em seguida.

| # | Regressão injetada | Resultado |
|---|---|---|
| 1 | barreira volta a ser piso caminhável | pegada (13 testes) |
| 2 | `settlePlacement` não confere o ponto — **o bug original** | pegada (4) |
| 3 | `isFree` esquece as zonas | **sobreviveu¹** |
| 4 | `crossesKeepOut` sai do `edgeFree` | **sobreviveu¹** |
| 5 | a navegação inteira esquece as zonas (3 + 4 juntas) | pegada |
| 6 | barreira de 0,8 m — dá para pular | pegada |
| 7 | empurrão do centro exato volta a ser `0/0` | pegada (5) |
| 8 | a conferência da transição ignora as zonas | pegada |
| 9 | a rede de segurança por quadro é removida | pegada |
| 10 | a placa volta para dentro da barreira | pegada |
| 11 | a estrutura é apagada em vez de bloqueada | pegada |
| 12 | só o piso de vidro é apagado | pegada |
| 13 | ninguém chama `sealKeepOuts` | pegada (14) |

¹ **As duas sobreviventes são metades redundantes da mesma regra**, e
vale dizer com todas as letras em vez de anunciar treze de treze.

A rede de caminhada rejeita um ponto dentro de uma zona em `isFree`, e
rejeita uma ligação que a atravesse em `edgeFree`. Acontece que
`edgeFree` **também** amostra `isFree` ao longo do segmento. Removendo
só a primeira, os pontos de dentro chegam a ser criados mas ficam
isolados — nenhuma ligação sai deles — e a poda de ilhas os descarta;
o resultado final é idêntico. Removendo só a segunda, a amostragem a
cada 3 m pega qualquer zona com mais de ~1,5 m de raio, que é toda zona
plausível. Cada uma esconde a outra.

As duas foram mantidas: `isFree` evita criar e realocar pontos dentro
da zona (sem depender da poda de ilhas, que num caso extremo poderia
manter o lado errado), e `crossesKeepOut` mede a distância exata do
centro ao segmento, sem a lacuna da amostragem. A mutação que importa —
tirar a regra de navegação inteira — **é pega**, por um teste que monta
a rede sem física nenhuma, só com a planta e a zona declarada.

Esse teste existe por causa de outra descoberta do exercício: as
primeiras versões dos testes de navegação passavam **mesmo sem a regra
de navegação**, porque a barreira sólida da física já afastava os
pontos. Estavam medindo a física. A versão atual monta a rede sem
`blocked`, sem `pointBlocked` e sem `edgeBlocked`, com uma zona de
mentira sobre o anel do roseiral, e inclui um controle que confirma que
aquele espaço é povoado quando a zona não está lá.

O mesmo vale para a preservação visual: a primeira versão media "ainda
há malhas na região", e passou quando o mirante inteiro foi apagado. A
versão atual conta os vértices do piso de vidro e da pérgula **dentro
do miolo** — e pega tanto o apagamento completo quanto o do piso
sozinho.

---

## Arquivos modificados

| Arquivo | O quê |
|---|---|
| `src/world/KeepOut.ts` | **novo** — a zona proibida e sua aritmética; registro por região |
| `src/cities/aurora-city/CityContext.ts` | `sealKeepOuts()`: a barreira física, para qualquer região |
| `src/cities/rosas-park/RosasPark.ts` | o piso deixa de ser colisor; a região se fecha; a placa sai para a borda |
| `src/cities/aurora-city/AuroraCity.ts` | a mesma chamada — Aurora não declara zonas hoje |
| `src/cities/rosas-park/RosasLayout.ts` | nota de onde a zona é declarada |
| `src/npc/WalkNetwork.ts` | a rede não entra nem atravessa; zonas injetáveis para teste |
| `src/npc/NpcSystem.ts` | `settlePlacement` empurra para fora; `enforceKeepOuts` por quadro |
| `src/world/RegionTransition.ts` | a conferência reprova quem estiver dentro |
| `tests/unit/coracao-roseiral.test.ts` | **novo** — 34 testes |

### Para fechar outra estrutura, um dia

Declare a zona em `keepOutsFor` e pronto. Física, navegação,
posicionamento e conferência passam a respeitá-la sem mais nenhuma
linha de código. Região sem zona declarada não paga nada — o laço não
roda.

---

## Resultados

- `npm run typecheck` — **0 erros**
- `npm test` — **894 passando, 5 pulados**, 45 arquivos (eram 860; +34)
- `npm run build` — **✓ em 386 ms**
- Nenhum teste existente precisou ser alterado.

Medida principal: Suki-Chan saiu de **0,00 m** do centro do Coração
para **13,20 m** — 1,2 m fora da borda da estrutura.

> **Validação visual:** o servidor de desenvolvimento sobe e serve a
> aplicação (HTTP 200), mas **não há navegador nem WebGL neste
> ambiente** — a cena não foi vista renderizada. Tudo acima é medido
> sem tela: geometria, colisão, navegação e posicionamento. Vale abrir
> o parque e olhar o Coração de perto, que é o único teste que falta.
