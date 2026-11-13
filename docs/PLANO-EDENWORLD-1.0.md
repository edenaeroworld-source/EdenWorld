# Plano de desenvolvimento — EDENWORLD 1.0

Documento vivo. Registra o que existe, o que está sendo feito e o que ainda
falta para a visão **EDENWORLD 1.0** descrita pelo universo Éden Aero.

## Estado do repositório (inspeção inicial)

A base recebida é a **Genesis 0.1**: um jogo 3D completo e funcional em
TypeScript + Three.js + Vite, com ~23 mil linhas, 96 testes unitários, 5
cenários de ponta a ponta, build de produção de ~1,7 MB e nenhuma dependência
de arte externa (tudo é gerado por código).

Sistemas **já prontos** (não reescrever):

| Área | Situação |
| --- | --- |
| Engine, laço de jogo, renderizador, qualidade adaptativa | completo |
| Aurora City (11 áreas, 22 edifícios, praça, parques, orla) | completo |
| Terreno, água, céu, clima, relógio dia/noite, vegetação, partículas | completo |
| Avatar do jogador, animação procedural, câmera em 3ª pessoa, física | completo |
| Entradas: teclado/mouse, toque, controle (Gamepad API) + remapeamento | completo |
| Interações (128 pontos), colecionáveis, portais, diário | completo |
| EdenPhone: mapa, diário, jornada, câmera, céu, ajustes | parcial |
| Salvamento local, exportar/importar, configurações | completo |
| NPCs, vida urbana, panteão, diálogo | **inexistente** |
| EdenOS (EdenGram, EdenTalk, EdenFeed, EdenReads…) | **só "em breve"** |
| Afters / BET | **inexistente** |
| Outras cidades, multijogador, eventos, moradia | **inexistente** |

## Milestones (ordem do documento oficial)

- **A — Estabilização da Genesis.** ✅ Verificado: `typecheck`, 96 testes,
  build de produção e servidor de desenvolvimento rodando.
- **B — Aurora City.** ✅ na essência (região central completa e explorável).
- **C — Identidade do jogador.** ✅ na essência (criador de avatar, movimento,
  câmera, animações).
- **D — EdenPhone e EdenOS.** ✅ entregue nesta etapa (7 aplicativos novos,
  todos funcionais e ligados ao jogo).
- **E — Afters (BET).** ✅ entregue nesta etapa (6 produtos, painel no
  EdenPhone, efeito visual no mundo, salvo no perfil).
- **F — Civilização viva (NPCs e panteão).** ✅ entregue nesta etapa (54
  moradores com rotina + 11 figuras do panteão com diálogo).
- **G — Outras cidades** (Bitnara, SkyStones, Rosas Park, Cidade da Liberdade,
  Noureja Nether, Jardim Proibido). ⏳ próximo grande bloco.
- **H — Social e multijogador.** ⏳ exige servidor (ver "Dependências externas").
- **I — Moradia e eventos.** ⏳
- **J — Otimização e lançamento.** ⏳

## Etapa concluída — "A cidade ganha gente" (D + E + F)

Objetivo: Aurora City deixa de ser um cenário bonito e passa a ser uma
civilização habitada, com EdenOS de verdade no bolso do jogador.

1. **Rede de caminhada** (`src/npc/WalkNetwork.ts`): grafo de nós e arestas
   derivado da planta da cidade (praça, avenidas, anel, trilhas), com busca de
   caminho A\*, validação de água/edifícios e filtro de componente conexo.
2. **Cidadãos** (`src/npc/CitizenData.ts`, `Citizen.ts`, `NpcSystem.ts`):
   população procedural com nome, arquétipo, aparência e rotina por horário.
   Simulação leve para todos; avatares completos só para os mais próximos
   (pool com orçamento de reconstrução por quadro).
3. **Panteão** (`src/characters/Pantheon.ts`): banco de dados dos personagens
   oficiais, cada um com domínio, perfil, aparência, local em Aurora City,
   diálogo e entrada de diário.
4. **Diálogo** (`src/characters/Dialogue.ts` + `src/interface/DialogueScreen.ts`):
   árvore de conversa com escolhas, efeitos (contato, diário, bandeiras) e
   interface navegável por mouse, toque, teclado e controle.
5. **EdenOS** (`src/edenos/`): aplicativos com funcionalidade real e local —
   EdenGram (fotos tiradas no jogo), EdenTalk (conversas com quem você
   conheceu), EdenFeed (acontecimentos do seu mundo), EdenReads (acervo de lore
   do universo). O que depende de servidor continua marcado como "em breve".
6. **Afters / BET** (`src/afters/`): catálogo de produtos (AfterBust®,
   AfterCurve®, GelGrow®, CandyGrow®, AfterLove, AfterVelvet) como **presets
   visuais estilizados** — aura, brilho, partículas, transição e som —
   controlados pelo EdenPhone e salvos no perfil.
7. **Salvamento v2**: contatos, bandeiras de diálogo, fotos, Afters e pessoas
   conhecidas. Salvamentos v1 continuam carregando.

### O que ficou pronto, com os números

| Entrega | Onde | Verificação |
| --- | --- | --- |
| Rede de caminhada de Aurora City | `src/npc/WalkNetwork.ts` | 7 testes: malha conexa, fora de prédios e água, A\* válido |
| 54 moradores com rotina por período | `src/npc/CitizenData.ts`, `CitizenSim.ts` | 10 testes: determinismo por semente, limites do mundo, pausa de conversa |
| Desenho dos moradores (até 18 visíveis) | `src/npc/NpcSystem.ts` | 11 testes com cena real: teto por qualidade, lista estável, liberação de memória |
| 11 figuras do panteão, com aura, nome e diálogo | `src/characters/Pantheon.ts` | 17 testes: cânone, árvores sem beco sem saída, efeitos |
| Tela de conversa | `src/interface/DialogueScreen.ts` | 4 testes em DOM: fala, escolhas, efeitos, encerramento |
| 7 aplicativos do EdenOS | `src/interface/EdenApps.ts`, `src/edenos/` | 19 testes em DOM: cada botão chama o jogo de verdade |
| Afters: catálogo + efeito no mundo | `src/afters/` | 12 testes: produtos, higienização, som, ciclo de vida |
| Salvamento v2 com migração da v1 | `src/systems/SaveSystem.ts` | 5 testes novos de migração e persistência |

Total: **202 testes unitários** (eram 96), `npm run typecheck` limpo e build de
produção em ~0,5 s (416 kB do jogo + 580 kB do Three.js, ~284 kB em gzip).

### Onde encontrar o panteão em Aurora City

| Figura | Lugar |
| --- | --- |
| Aérion | Praça Central, junto à Esfera Aurora |
| Haru | Centro Éden Connect |
| Nexara | Torre Zênite |
| Suki‑Chan | Estufa Celeste |
| Luma | Ateliê Aero (libera o painel Afters) |
| Lilly | Palco Aurora |
| Akemi‑Chan | Mercado Éden |
| Saturno | Casa EdenPawl |
| Maze | Margem leste do lago |
| Júpiter | Pavilhão Lúmen |
| Amara (Deusa da Maternidade) | Mirante Celeste |

Com `?debug`, `__eden.irPara('haru')` leva direto até qualquer uma delas.

## Regras de honestidade adotadas

- Nada é apresentado como on-line: EdenGram, EdenTalk e EdenFeed dizem
  explicitamente que são **locais deste aparelho** até existir um servidor.
- NPCs nunca são mostrados como jogadores reais; não há contagem de jogadores.
- Recursos sem implementação continuam com o selo "em breve" no EdenPhone.
- Afters é tratado como tecnologia estética abstrata (aura, luz, silhueta),
  sem detalhe anatômico ou enquadramento sexualizado.

## Próxima etapa sugerida — "A noite tem nome" (G, começo)

1. **Era Vice Éden**: camada noturna própria de Aurora City — letreiros de néon,
   pôr do sol tropical, paleta quente sobre o aqua, reflexo na água molhada.
   Hoje a noite é só uma iluminação mais escura; o EdenFeed já reconhece o
   período, mas o mundo ainda não muda de personalidade.
2. **Quarto nível de qualidade (Ultra)**: o documento pede Baixa/Média/Alta/Ultra;
   existem três.
3. **`RegionManager` + primeira cidade nova**: Bitnara (abre em 14/11/2026) ou
   Jardim Proibido, reaproveitando `CityContext` e a rede de caminhada.
4. **Cadeia de missões do BlueBloom**: hoje é acervo no EdenReads; vira linha
   de missões com Haru e Nexara, sem nunca corromper o mundo de forma
   permanente.

## Dependências externas (ainda não disponíveis)

| Recurso | O que falta |
| --- | --- |
| Multijogador, Éden Connect, perfis on-line | servidor, autenticação e hospedagem |
| EdenStore, EdenTV, EdenGame, EdenPawl | definição de catálogo/conteúdo oficial |
| Música licenciada de Bitnara/SkyStones | trilhas originais ou licenciadas |
| Modelos oficiais dos personagens | arte de referência; hoje são aparências procedurais fiéis à descrição |
| Testes de ponta a ponta desta etapa | Chrome/Chromium — não há navegador nesta máquina e o download está bloqueado. Rodar `npm run test:e2e` localmente |

## Pontos de cânone a confirmar com o criador

- ~~**Amara**~~ — **resolvido pelo criador em 12/11/2026**: Amara é a **Deusa da
  Maternidade** e está **grávida**. A gestação é identidade, não fase: entra na
  ficha, no diálogo, no diário, no EdenPhone e na silhueta do avatar em
  `src/player/Gestation.ts`. O cânone declarou o domínio e a gestação — e só
  isso. Não há filho, pai, data nem parto inventados em lugar nenhum, e um
  teste em `tests/unit/pantheon.test.ts` guarda essa fronteira.
- **Kling** (Noureja Nether): citado apenas no acervo do EdenReads até a região
  existir.
- **Concurso Divino**: datas e regras completas do próximo ciclo.
