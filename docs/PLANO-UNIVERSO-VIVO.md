# Plano — Universo Vivo

Expansão do EdenWorld de uma cidade para um universo: várias regiões,
interiores, economia, moradia, bichos, fauna e atividades.

Este documento registra **o que foi construído, o que ainda não foi, e
por quê** — na mesma linha dos outros planos da pasta: nada aqui
promete o que o código não faz.

## O princípio que organiza tudo

> Regiões são partes permanentes do mesmo mundo, **não fases**.

Disso decorre o resto do desenho:

- Não existe seleção de nível, nem ordem obrigatória, nem "concluir" uma
  região. Descobrir é só saber que o lugar existe.
- Tudo que o jogador tem atravessa a viagem: cristais, inventário,
  bichos, casas, atividades e progresso. O salvamento é um só.
- Atividades são opcionais e fora de ordem. Dos seis conjuntos escritos,
  apenas um tem pré-requisito — e um teste impede que esse número
  cresça sem alguém decidir explicitamente.

## Arquitetura

Cada sistema é um **módulo puro** (sem Three.js, sem DOM), e um único
orquestrador costura as regras que cruzam sistemas.

| Módulo | Responsabilidade |
| --- | --- |
| `src/regions/Region.ts` | As sete regiões: identidade, lugares, lojas, fauna, padroeiros, vizinhança |
| `src/regions/RegionManager.ts` | Onde o jogador está, o que descobriu, viagem, posição por região |
| `src/interiors/Interior.ts` | Definição dos interiores: cômodos, andares, objetos, iluminação |
| `src/interiors/InteriorManager.ts` | Entrar/sair, um interior por vez, caminho de volta |
| `src/economy/Items.ts` | Catálogo aberto de itens e lojas, com horário de funcionamento |
| `src/economy/Economy.ts` | Carteira, inventário, compra, devolução, extrato |
| `src/housing/Housing.ts` | Imóveis, posse, grade de 0,5 m, colocação de móveis |
| `src/creatures/Species.ts` | Registro aberto de espécies (doméstica / selvagem / Éden) |
| `src/creatures/PetManager.ts` | Adoção, nome, necessidades, acompanhamento |
| `src/creatures/Wildlife.ts` | Spawn por habitat e hora, orçamento por aparelho, guia de bichos |
| `src/missions/Missions.ts` | Atividades, objetivos fora de ordem, recompensas |
| `src/universe/UniverseSystem.ts` | **O orquestrador**: onde os sistemas se encontram |
| `src/interface/UniverseApps.ts` | Seis telas no EdenPhone |

### Por que um orquestrador

As regras interessantes cruzam sistemas: comprar uma casa mexe na
carteira *e* na posse; pôr um móvel tira do inventário *e* conta para a
atividade; viajar leva os bichos *e* fecha o interior. Se cada módulo
conhecesse os outros, sete módulos virariam um nó.

O `UniverseSystem` é o único lugar que conhece todos. Os módulos
continuam puros e testáveis isoladamente.

## O que funciona de verdade

Tudo abaixo tem teste automatizado que clica no botão e confere o
**estado do jogo**, não a aparência da tela.

- **Viagem** entre as sete regiões, com rota mais curta por busca em
  largura, bloqueio explicado em português e retorno ao ponto exato onde
  o jogador parou em cada região.
- **Descoberta**: conversar com quem cuida de uma região revela a região
  (`indicacao`). Aceitar uma atividade revela os lugares que ela manda
  visitar. As regiões de `exploracao` — Noureja Nether e Jardim
  Proibido — continuam escondidas: têm de ser achadas.
- **Economia**: 30 itens em 7 marcas, 13 lojas com horário real
  (inclusive uma que atravessa a madrugada), compra, devolução com
  prazo, extrato. Nada é vendido fiado.
- **Moradia**: 4 imóveis, compra ou aluguel, grade de colisão que
  impede empilhar móvel ou atravessar parede, giro que troca largura por
  profundidade.
- **Bichos**: 8 espécies domésticas adotáveis, nome, necessidades que
  caem devagar, acompanhamento entre regiões.
- **Fauna**: 13 espécies selvagens e 5 criaturas do Éden, spawn por
  habitat e hora, guia de avistamentos.
- **Atividades**: 6 conjuntos, objetivos em qualquer ordem, recompensas
  entregues automaticamente.
- **Interiores**: 6 definidos, um carregado por vez, saída pela porta
  certa, andares.
- **Salvamento v3**, com os sete estados novos — e salvamentos Genesis
  v1/v2 continuam abrindo.

### Duas decisões que valem explicação

**As necessidades dos bichos não punem.** Caem devagar e mudam o humor,
nunca a saúde. Nenhum bicho morre, adoece ou é tirado do jogador por
descuido. Isto é um mundo para morar, não um relógio de culpa.

**Animal selvagem não vira bicho de estimação.** A regra está em
`Species.isAdoptable` e é checada de novo na adoção. O Jardim Proibido
existe justamente porque o que é selvagem continua selvagem — e Saturno
não deixaria passar.

## O que **não** está pronto

Isto é a parte importante deste documento.

| Pedido | Situação |
| --- | --- |
| Cenário 3D das 6 regiões novas | **Não construído.** Só Aurora City tem mundo tridimensional. As outras existem como regiões de verdade (mapa, lojas, fauna, atividades, imóveis), e a tela diz isso com todas as letras em vez de levar o jogador para o vazio |
| Geometria dos interiores | **Pronta no marco H** (`InteriorScene`). Ver `PLANO-ROSAS-3D.md` |
| Decoração de casa na tela | A lógica de colocar/mover/tirar móvel está completa e testada; falta o editor visual. Hoje dá para comprar e a casa guarda, mas a colocação não tem interface |
| Objetos de casa que abrem telas | `Housing.interactables` já identifica o computador e o console colocados; falta ligar ao `EdenPhone` |
| IA de bicho no mundo 3D | `PetManager` guarda estado e posse; o bicho ainda não é desenhado seguindo o jogador |
| Fauna no mundo 3D | **Pronta no marco H** (`CreatureMesh` + `WildlifeView`). Ver `PLANO-ROSAS-3D.md` |
| Multijogador | Fora do alcance desta etapa, como nas anteriores |

## Desempenho

O que foi feito por desenho, não medido:

- Um interior carregado por vez, com liberação garantida por teste.
- Orçamento de fauna por nível de qualidade (4 no celular, 20 no ultra).
- Nenhuma região carrega cenário de outra.
- As necessidades dos bichos são recalculadas uma vez por segundo, não
  por quadro.

**Não medido:** não há navegador nesta máquina, então o custo real da
expansão em quadros por segundo não foi verificado. O medidor `?bench`
continua disponível para medição em aparelho real.

## Compatibilidade

`SAVE_VERSION` foi de 2 para 3. Os sete estados novos entram com valor
padrão quando faltam, então **um salvamento Genesis antigo abre sem
conversão** — há teste que carrega um v1 completo e confere que o
progresso antigo sobrevive inteiro.

Uma armadilha evitada: o sanitizador rejeitava posição fora do raio de
Aurora City. Com regiões de raios diferentes, isso apagaria a posição de
quem salvasse em outra região. O limite agora é o da região atual, e as
regiões são lidas **antes** da posição.

## Próximos passos sugeridos

1. ~~Cenário 3D de Rosas Park~~ — **feito** no marco H.
2. ~~`InteriorLoader` concreto~~ — **feito** no marco H: `InteriorScene`
   monta qualquer `InteriorDef`, incluindo o Ateliê Aero.
3. Editor de decoração, aproveitando a grade que já existe.
4. ~~Fauna desenhada~~ — **feita** no marco H. Falta o bicho de
   estimação seguindo o jogador.

Ver `PLANO-ROSAS-3D.md`.
