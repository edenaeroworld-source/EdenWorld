# Marco L — Integridade dos portais, estado do mundo e persistência

Este documento conta o que estava quebrado quando o jogador viajava entre
regiões, por que estava, e o que foi feito. Está em português porque é
assim que o resto da documentação do EdenWorld é escrita.

---

## O sintoma

Viajar de Aurora City para Rosas Park e voltar não devolvia Aurora City.
Devolvia uma imitação dela:

- o progresso de exploração sumia (cristais, trechos do diário, áreas);
- a cidade voltava "lavada de luz", clara demais, a qualquer hora;
- os personagens do panteão apareciam em lugares trocados, às vezes dois
  no mesmo ponto;
- os portais não lembravam em que pé estavam.

Quatro sintomas diferentes, quatro causas diferentes — e uma quinta que
só aparecia dentro dos prédios. Nenhuma delas era "o bug da viagem".

---

## As cinco causas

### 1. A limpeza do progresso apagava o que não era dela

`ProgressSystem.retain()` recebia a lista do que existe e **apagava tudo
o que não estivesse nela**. Em `Engine.ts:467` essa lista era só a da
região carregada naquele instante. Ou seja: ao chegar em Rosas Park, o
jogo passava a lista de Rosas Park e o sistema concluía que todos os
cristais de Aurora tinham deixado de existir.

**O conserto.** Cada item ganhou uma etiqueta de origem (`origins`,
`kind:id → regionId`). A limpeza virou `retainKnown(known, regionId)` e
só mexe no que nasceu *naquela* região. O que é de outra região não é
problema dela.

### 2. A viagem era mais magra do que o início do jogo

O `init()` do Engine fazia um trecho de ligação (relógio, portais, NPCs,
área atual) que o `enterRegion()` simplesmente não repetia. Chegar
viajando nunca foi igual a começar ali.

**O conserto.** Esse trecho virou um método só, `applyRegionState(id)`,
chamado **pelos dois caminhos**. O que é de ligação única — `wireEvents()`
— continua acontecendo uma vez só, como deve.

### 3. A luz: não era o renderizador, era o relógio

Esta custou a aparecer. `World.build()` cria um `Environment` novo, que
cria um `WorldClock` novo, que começa em `WORLD.startHour` — 9h30. A
viagem nunca chamava `applyClockFromSave`. Então **toda chegada era
9h30 da manhã**, e a intensidade do ambiente (`0.3 + 0.34 × luz do dia`)
vinha junto. Chegar às duas da manhã dava uma Aurora ensolarada.

**O conserto.** Três partes: `captureWorldClock()` guarda a hora antes de
descarregar; `applyClockFromSave()` devolve a hora depois de carregar; e
`Environment.dispose()` agora devolve a cena ao neutro — porque a cena
sobrevive à troca de região e o `Environment` não, então o que ele
escreveu na cena tem de sair junto com ele.

> O teste que prova isso é um **controle negativo**: a bateria B roda a
> transição *sem* a etapa de guardar e verifica que duas da manhã viram
> 9h30. Se o conserto for removido, esse teste é o que avisa.

### 4. Os personagens: duas funções de posicionamento

O início do jogo usava o `place` declarado em cada personagem. A viagem
usava `places[id.length % places.length]` — o lugar escolhido pelo
**tamanho do nome**. `suki` e `maze` têm quatro letras cada; disputavam o
mesmo ponto.

**O conserto.** Uma função só. `createPantheon()` passou a cuidar apenas
de identidade, e `setRegion()` virou o único caminho que coloca alguém no
mapa: `claimPlace` escolhe um lugar livre, `settlePlacement` encosta no
nó de caminhada mais próximo (até 18 m) e, se ainda houver encosto,
abre um anel de 8 direções em `PLACE_SPACING × {1, 1.8, 2.6}`.

### 5. Os portais não tinham estado — tinham um interruptor

Era uma lista de ids ativados. Não havia como um portal estar pela
metade, e qualquer recarregamento tinha de decidir entre tudo e nada.

**O conserto.** Uma escada de cinco degraus:

```
desconhecido → descoberto → parcial → ativado → pronto
```

Subir é **monotônico**: nada rebaixa o que o jogador já conquistou. O
último degrau não depende do portal, e sim da rede — um portal ativado
sozinho não leva a lugar nenhum, então `refreshPortalReadiness()` só
promove a `pronto` quando existem dois. O EdenPhone agora pergunta
`travelReady(id)`, não `hasPortal(id)`: oferecer uma viagem impossível
é uma promessa falsa.

Salvamentos antigos, sem `portalStates`, entram com tudo em `pronto`. O
`SAVE_VERSION` continua **3** — os campos novos são opcionais.

---

## A transição, agora em quatro etapas

Virou um módulo próprio, `src/world/RegionTransition.ts`, sem Three.js e
sem DOM — dá para testá-lo inteiro:

| Etapa | O que faz |
|---|---|
| `salvar` | guarda o relógio e revalida os portais |
| `descarregar` | descarta coletáveis, cena e mundo |
| `carregar` | constrói a região, religa a física e chama `applyRegionState` |
| `validar` | confere o resultado com `checkRegionIntegrity` |

A ordem importa e é testada: **guardar vem antes de descarregar**. A
bateria F inverte as duas e exige que algum teste reclame.

As etapas **não** são embrulhadas em `try/catch`. Uma transição que falha
no meio tem de falhar visivelmente, não deixar o jogador num mundo pela
metade.

`checkRegionIntegrity` é a conferência final: id repetido, personagens
sobrepostos (`MIN_CHARACTER_SEPARATION 1.1`), enterrado ou flutuando
(`GROUND_TOLERANCE 0.35`), posição inválida, fora do limite da região.
Quem está desligado (`active: false`) não entra na conta.

---

## O patamar da escada (§8)

Dentro dos prédios de mais de um andar, a mobília do acabamento às vezes
parava bem na saída da escada. Em `torre-zenite` sobravam **36 cm** entre
o último degrau e a primeira vitrine.

Não era colisão, nem o "muro de gôndolas" que uma investigação anterior
sugeriu — essa hipótese foi conferida com inundação a partir do ponto de
entrada e **está descartada**. Era arrumação.

**O conserto é universal, não um remendo por prédio.** `stairKeepOut()`
reserva 2 m à frente da boca da escada *antes* de qualquer acabamento
rodar. O `InteriorBuild` ganhou `reserve`/`reserved`, o `at()` respeita a
reserva, e `atAnyway()` existe para a estrutura (portas, paredes), que
precisa passar por cima dela. Nenhum dos sete arquivos de acabamento foi
tocado — eles continuam chamando `b.at(...)` e o resultado fica certo
sozinho. O prédio que vier depois herda a regra.

Medido: `torre-zenite` passou de **0,36 m** para **3,16 m** de folga.

---

## Como isto está verificado

Duas suítes, 69 testes entre as duas.

`tests/unit/universo-persistencia.test.ts` — **29 testes**, baterias A–G:

- **A** · personagens depois da viagem: chegar viajando produz exatamente
  o mesmo que começar ali; cada um num lugar diferente; Rosas Park mostra
  os três donos da casa, no chão, **depois de uma viagem de verdade**.
- **B** · a luz volta como estava, nas cinco horas do dia — com o
  controle negativo que reproduz o bug.
- **C** · o progresso atravessa a viagem, por região e no universo.
- **D** · a escada dos portais: ordem, monotonicidade, estado parcial que
  sobrevive ao arquivo, migração de salvamento antigo, e o caminho que o
  jogo realmente percorre ao encostar num portal.
- **E** · ida e volta pelo saneador, campos ausentes, dados corrompidos.
  **E2** · uma atividade pela metade continua pela metade.
- **F** · cinco viagens Aurora↔Rosas seguidas, sem acúmulo nem desvio.
- **G** · toda região joga pelas mesmas regras — inclusive uma região
  sintética, que não existe ainda, para que a próxima herde a conferência.

`tests/unit/interiores-escadas.test.ts` — **40 testes**, incluindo a
saída da escada conferida *pela física*: o corpo do jogador é empurrado
ao longo do corredor e tem de não encostar em nada.

### Os testes foram testados

Dez regressões injetadas de propósito, uma por vez, cada uma desfeita em
seguida. **Dez pegas.** Duas delas acharam buracos de verdade:

| # | Regressão injetada | Resultado |
|---|---|---|
| 1 | panteão volta a escolher lugar pelo tamanho do nome | pegada¹ |
| 2 | sem a reserva do patamar da escada | pegada |
| 3 | `retainKnown` volta a apagar tudo | pegada |
| 4 | transição descarrega antes de guardar | pegada |
| 5 | portal pode ser rebaixado | pegada |
| 6 | `Placement` ignora a reserva | pegada |
| 7 | um portal sozinho já viaja | pegada |
| 8 | tolerância de chão afrouxada | pegada |
| 9 | `dispose` esquece de normalizar a luz | pegada² |
| 10 | personagens desligados entram na conferência | pegada |

¹ **Na primeira tentativa esta sobreviveu.** O anel de desempate afastava
os dois personagens e o teste, que media só a distância final, ficava
verde. Duas defesas sobrepostas escondiam uma falha numa delas. Foi
preciso um teste que medisse a **escolha** do lugar, não o resultado
depois do desempate.

² Esta também sobreviveu de início: não havia teste nenhum sobre a
limpeza da cena. Para que houvesse, a limpeza saiu de dentro da classe e
virou `resetSceneAtmosphere(scene)` — uma função pura, conferível sem
placa de vídeo.

### Números

- `npm run typecheck` — **0 erros**
- `npm test` — **860 passando, 5 pulados**, 44 arquivos
- `npm run build` — **✓ em 642 ms**

Tudo foi verificado em ambiente sem tela: **não há navegador nem WebGL
neste sandbox**, então nada aqui foi visto rodando. As duas suítes novas
são de lógica e geometria pura, que é exatamente o que dá para garantir
sem uma tela — a conferência visual continua valendo a pena.
