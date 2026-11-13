# Plano — Controles universais & desempenho · “um jogo só”

Documento de implementação. Registra o que foi inspecionado, a decisão
técnica, o que cada arquivo faz — e, no fim, o que **não** foi verificado.

A exigência que organiza tudo: **não existe versão mobile**. Existe o
EDENWORLD, e ele é jogável no computador, no Android e no iPhone/iPad.
Mesma Aurora City, mesmos 54 moradores, mesmo panteão, mesmo EdenPhone,
mesmo progresso. O que muda entre um aparelho e outro é **como o comando
entra** e **quanto trabalho a máquina aceita fazer** — nunca o que o jogo é.

## 1. O que já existia (inspeção, antes de tocar em qualquer arquivo)

| Peça | Situação encontrada |
| --- | --- |
| `src/input/InputManager.ts` | Já havia uma camada unificada: `InputFrame{moveX,moveY,lookX,lookY,zoom,run,jumpHeld}` e `GameAction`. Teclado, toque e controle já alimentavam o **mesmo** formulário. Base boa. |
| `src/input/TouchInput.ts` | Analógico virtual, arrasto de câmera, pinça, botões de interagir/correr/pular. Faltavam EdenPhone e pausa — no celular não havia como abrir nenhum dos dois. |
| `src/input/InputManager.ts` · `detectInitialDevice` | Decidia o modo de entrada por `maxTouchPoints > 0`. Um notebook com tela de toque nascia em modo celular; um iPad, que se declara Macintosh, nascia em modo teclado. |
| `src/systems/QualitySystem.ts` | Três níveis (`baixa`/`media`/`alta`) mexendo em resolução, sombras, distância e partículas. Sem Ultra, sem meta de FPS, sem frequência de simulação. |
| `src/npc/NpcSystem.ts` | Tabela `POPULATION` local decidia quantos moradores desenhar por nível — um segundo lugar onde “qualidade” era definida. Todos os 54 moradores avançavam em **todo** quadro, visíveis ou não. |
| `src/systems/QualitySystem.ts` · `monitor()` | Resolução dinâmica comparando o FPS com **60 fixo**, e só devolvendo resolução acima de `60 × 1,15`. |
| `src/core/Renderer.ts` | Já ouvia `resize`, `orientationchange` e `visualViewport.resize`. Nada repassava a orientação para a interface. |
| `index.html` | Já trazia `user-scalable=no, viewport-fit=cover` e as variáveis `--safe-*`. |
| `src/styles/main.css` | Vários cortes por largura. Nenhum por **tipo de ponteiro**: botões de 32 px e trilhas de slider de 4 px valiam igual para mouse e para polegar. |

Resumo honesto: a arquitetura de entrada **já estava certa**. O que faltava
era detecção decente, o que falta no celular (telefone, pausa, orientação),
um degrau a mais de qualidade para cima e, principalmente, régua para medir.

## 2. Decisão técnica

### 2.1 Detectar aparelho é uma função pura, não um `if` no construtor

`src/core/Platform.ts` não lê `navigator`. Ele recebe um `PlatformProbe` —
`{userAgent, platform, maxTouchPoints, coarsePointer, hover, screenMin,
screenMax}` — e devolve um `PlatformInfo`. Quem lê o navegador é
`probePlatform()`, chamado **uma vez** pelo Engine.

A separação não é preciosismo: é o que permite `tests/unit/plataforma.test.ts`
passar cadeias reais de iPhone, Pixel, Galaxy Tab, iPad e notebook com tela
de toque, e verificar o resultado sem navegador nenhum. Duas armadilhas
conhecidas estão cobertas por teste:

1. **O iPad mente.** Desde o iPadOS 13 ele se apresenta como
   `Macintosh; Intel Mac OS X`. A única pista é `maxTouchPoints > 1` — um
   Mac de verdade responde 0. Sem esse desempate, todo iPad do mundo cai no
   esquema de teclado e o jogador fica sem analógico.
2. **O tablet Android esconde.** O Chrome em tablet omite a palavra
   `Mobile`. O desempate é o lado menor da tela: `screenMin >= 600` é tablet.

E o caso simétrico, que quase todo jogo erra: **um notebook com tela de
toque continua sendo um computador**. `coarsePointer` e `hover` decidem,
não a existência de toque.

### 2.2 A preferência do jogador vence a detecção — sempre

`ControlScheme = auto | teclado | toque | controle`, gravado em
`InputSettingsData.scheme` e resolvido por `resolveScheme(pref, platform)`.
No `auto`, o jogo começa no esquema detectado e **troca sozinho** quando o
jogador usa outra coisa (encostar na tela liga o analógico, mexer no teclado
desliga). Fixado em qualquer outro valor, `schemeLocked` fica verdadeiro e a
troca automática para de acontecer.

Isso cobre os dois casos reais que a detecção nunca acerta sozinha: tablet
com teclado Bluetooth acoplado, e notebook de tela sensível que o dono
prefere jogar com o dedo.

### 2.3 Um único caminho de jogo, verificado por comparação

Não há código de movimento “para celular”. `tests/unit/toque.test.ts` prova
isso do jeito mais direto possível: executa a **mesma ação** pelos dois
caminhos e compara os quadros resultantes.

```ts
key('keydown', 'KeyW');                      // teclado
touch(canvas, 'pointermove', 1, 120, 244);   // polegar no analógico
expect(touchFrame.moveY).toBeCloseTo(keyboardFrame.moveY, 5);
```

Os botões da tela não chamam funções próprias: emitem `jump`, `phone`,
`pause` — exatamente as mesmas `GameAction` que `Space`, a tecla do telefone
e `Esc`. O teste verifica a lista emitida pelos dois lados e exige
igualdade.

### 2.4 Bloquear o gesto do navegador sem quebrar o navegador

`src/input/BrowserGestures.ts` é uma guarda que **só existe enquanto o jogo
está em cena**. Ela cancela:

- `gesturestart/change/end` (a pinça proprietária do Safari);
- `touchmove` com **dois ou mais** dedos, em qualquer lugar;
- `touchmove` de um dedo **sobre o canvas**;
- `contextmenu` sobre o canvas (o menu do toque longo).

E deliberadamente **não** cancela `touchmove` de um dedo fora do canvas:
rolar a lista de configurações, o feed do Afters ou o histórico de conversa
continua sendo rolagem normal do navegador. Fora do modo de jogo a guarda se
desliga inteira — `setTouchControlsAllowed(false)` — e a página volta a se
comportar como página, com zoom de acessibilidade e tudo.

O complemento em CSS é `touch-action`: `pan-y` nos corpos roláveis,
`pan-x` na fita de abas. Quem declara a intenção ao navegador não precisa
cancelar evento, e a rolagem não engasga.

### 2.5 Qualidade passa a mandar na simulação, não só no desenho

O gargalo de um celular não é só pixel: são 54 moradores com rotina,
caminho e animação. `QualityProfile` ganhou cinco campos —
`npcVisible`, `npcRange`, `npcSimHz`, `npcRoutinePerFrame`,
`environmentEffects` — e a tabela `POPULATION` que vivia dentro do
`NpcSystem` **deixou de existir**. Agora há um lugar só onde “qualidade”
é definida.

A simulação ficou de **duas velocidades**: quem está desenhado na tela anda
em todo quadro (senão a animação treme); quem está longe avança em passos
agrupados, a `npcSimHz` hertz. Ninguém é congelado — o morador continua
andando, só com passo mais grosso, e ao reaparecer está onde deveria estar.
`tests/unit/desempenho.test.ts` conta os avanços: 3 240 por segundo em Ultra
contra 840 em Baixa, com os 54 moradores inteiros em qualquer nível.

| | pixel | sombra | distância | partículas | moradores vis. | alcance | sim. | rotinas/quadro | efeitos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Baixa** | ×1,0 · 80% | — | 420 | 0,35 | 7 | 48 | 12 Hz | 1 | não |
| **Média** | ×1,5 · 100% | 1024 | 620 | 0,70 | 12 | 70 | 20 Hz | 2 | sim |
| **Alta** | ×2,0 · 100% | 2048 | 820 | 1,00 | 18 | 95 | 30 Hz | 2 | sim |
| **Ultra** | ×2,0 · 100% | 4096 | 1100 | 1,00 | 18 | 130 | todo quadro | 3 | sim |

Os três níveis antigos mantêm **exatamente** os valores de população que
tinham antes (7/48, 12/70, 18/95): quem já jogava não vê diferença.

### 2.6 A meta de FPS é uma escolha, e o teto de recuperação tinha um bug

`fpsTarget: 30 | 60` entra nas configurações gráficas, nasce em 30 no
aparelho de mão e 60 no computador, e é **a** referência da resolução
dinâmica: cai 10% depois de 2,5 s abaixo de `meta × 0,9`, sobe 5% depois de
6 s em `meta × 0,98`, piso em 55%.

O `0,98` é o conserto de um bug real. O código anterior só devolvia
resolução acima de `60 × 1,15 = 69 FPS` — e, com vsync, numa tela de 60 Hz,
o jogo **nunca** passa de 60. A resolução caía na primeira tropeçada e
ficava baixa para sempre. Há um teste com esse nome exato
(`com meta de 60 numa tela de 60 Hz, a resolução volta a subir`) justamente
para que ninguém “conserte” o número de volta.

### 2.7 Histerese no raio de desenho

Entrou um detalhe que só aparece medindo: o morador que caminha **na borda**
do raio de desenho entrava e saía de cena a cada poucos segundos, e cada
entrada reconstrói um avatar — de longe a operação mais cara do sistema. Pior:
o problema é maior justamente na qualidade Baixa, onde o raio é menor.

Agora entra em `npcRange` e só sai em `npcRange × 1,3`.

### 2.8 Alvo de 44 px vem do tipo de ponteiro, não da largura da tela

O bloco `@media (pointer: coarse)` eleva botões, abas, fichas e amostras de
cor a 44 px de lado mínimo, engorda a trilha do slider de 4 px para 16 px e
o polegar para 36 px, e esconde as teclas desenhadas (`.keycap`) dos avisos
— num celular, “pressione E” é instrução para ninguém.

Largura é a pergunta errada: um tablet de 1024 px tem tela larga e dedo
grosso; um notebook de 1024 px, tela larga e cursor fino.

## 3. Arquivos

### Criados

| Arquivo | Papel |
| --- | --- |
| `src/core/Platform.ts` | Detecção pura de sistema, formato e esquema de comando; orientação e sugestão de deitar o aparelho. |
| `src/input/BrowserGestures.ts` | Guarda de gestos do navegador, ligável e desligável. |
| `src/systems/Benchmark.ts` | Medidor de FPS real: média, mediana, 1% pior, quadros dentro da meta. |
| `docs/PLANO-CROSS-PLATFORM.md` | Este documento. |
| `tests/unit/plataforma.test.ts` | 21 testes de detecção, preferência e orientação. |
| `tests/unit/toque.test.ts` | 17 testes comparando dedo e teclado, mais a guarda de gestos. |
| `tests/unit/desempenho.test.ts` | 14 testes de custo de simulação, medidor e resolução dinâmica. |
| `tests/unit/ajustes-tela.test.ts` | 12 testes do painel de configurações em tela de celular. |

### Modificados

| Arquivo | Mudança |
| --- | --- |
| `src/core/Engine.ts` | Sonda a plataforma, repassa ao `InputManager`, publica `data-platform`/`data-orientation`, reage a `resize`, sugere paisagem uma vez, roda `?bench` e expõe `__eden.plataforma()` / `__eden.medir()` / `__eden.desempenho()`. |
| `src/systems/QualitySystem.ts` | Nível Ultra, `fpsTarget`, cinco campos de simulação no perfil, sugestão inicial ciente do aparelho, `monitor()` relativo à meta. |
| `src/npc/NpcSystem.ts` | Tabela local removida, simulação de duas velocidades, rotinas por quadro, histerese no raio de desenho. |
| `src/input/InputManager.ts` | Esquema vindo da plataforma, `schemeLocked`, troca automática só no `auto`. |
| `src/input/InputSettings.ts` | Campo `scheme`, padrão e saneamento. |
| `src/input/TouchInput.ts` | Botões de EdenPhone e pausa, orientação, zona do analógico por orientação, guarda de gestos. |
| `src/interface/SettingsScreen.ts` | “Meta de quadros” e “Esquema de comando”, com o aparelho detectado escrito na tela. |
| `src/interface/dom.ts` | `choiceGroup` aceita valor numérico (a meta de FPS). |
| `src/systems/SaveSystem.ts` | Saneamento de `ultra` e `fpsTarget`. |
| `src/world/World.ts` · `src/world/Particles.ts` · `src/afters/AftersSystem.ts` | Respeitam `environmentEffects` e a densidade de partículas do perfil. |
| `src/styles/main.css` | Bloco “Multiplataforma”: `pointer: coarse`, retrato, tela baixa. |

## 4. Como medir no seu aparelho

Nenhum número de celular neste documento foi medido por quem o escreveu —
não havia celular. A ferramenta existe para que você produza os seus:

```
https://…/?bench         20 s de medição
https://…/?bench=45      45 s
```

A medição começa 2 s depois de o jogo entrar em cena (não no menu), descarta
os 30 primeiros quadros — compilação de shader e primeiro desenho não são o
jogo em regime — e, ao terminar, mostra um aviso na tela e imprime no
console:

```
EDENWORLD — medição de desempenho
Aparelho: Android · celular
Qualidade: media · meta 30 FPS · resolução 100%
Amostra: 612 quadros em 20,3 s
Média: 30,1 FPS · mediana: 30,0 FPS
1% pior: 21,4 FPS · mínimo: 19,8 · máximo: 31,2
Dentro da meta: 94% dos quadros
Último quadro: 118 chamadas de desenho, 243.551 triângulos
```

Ande pela cidade durante a medição, de preferência pela praça, que é onde há
mais gente. Com `?debug`, `__eden.medir(30)` repete a medição a qualquer
momento e `__eden.desempenho()` devolve o último relatório.

## 5. Limites assumidos e declarados

1. **Desempenho em celular não foi verificado.** Não há aparelho móvel neste
   ambiente, nem navegador com GPU. Os números das metas — 30 FPS estáveis em
   celular intermediário, 60 em hardware capaz — são **metas de projeto**, não
   resultados. O que foi verificado é outra coisa, e está dito com precisão
   na seção 6.
2. **Não houve teste em navegador.** Chrome e Chromium não podem ser
   instalados aqui (a instalação é bloqueada pela rede). Toda a verificação
   é de unidade, com DOM simulado.
3. **A detecção foi testada contra cadeias de identificação, não contra
   aparelhos.** Um modelo que se identifique de forma inédita pode cair no
   formato errado — e aí o jogador corrige à mão em Configurações ▸ Teclado e
   toque, que é exatamente para isso que a opção existe.
4. **Pular depende do personagem**, como antes; o botão da tela só aparece
   quando a ação existe.
5. **Retrato é funcional, não recomendado.** A interface se adapta — os
   botões encolhem, o analógico sobe, o EdenPhone ocupa a largura — mas se vê
   menos cidade. O jogo avisa uma vez, com um aviso que não bloqueia nada.

## 6. O que foi verificado, exatamente

- `npm run typecheck` — limpo.
- `npm test` — **448 testes passando**, 4 pulados (os dois de renderização
  por software rodam com `EDEN_RENDER=1`).
- `npm run build` — compila.
- Detecção: 10 aparelhos distintos por cadeia de identificação, incluindo os
  dois casos que enganam (iPad como Macintosh, tablet Android sem `Mobile`).
- Equivalência de comando: andar, girar a câmera, dar zoom, pular, abrir o
  telefone, pausar e correr — pelo dedo e pelo teclado, comparados entre si.
- Guarda de gestos: pinça do Safari e menu de toque longo bloqueados;
  rolagem de um dedo fora do canvas preservada; nenhum ouvinte deixado para
  trás ao desligar.
- Custo da simulação: contagem determinística de avanços de morador por
  nível de qualidade (3 240/s em Ultra contra 840/s em Baixa), com os 54
  moradores vivos nos dois.
- Painel de configurações: as cinco abas abrem em tela de celular, a meta de
  quadros e o esquema de comando gravam a escolha, e o foco do teclado
  sobrevive ao redesenho do painel.

O que **não** está nessa lista: quadros por segundo em aparelho real. Esse
número só existe depois que alguém com um celular na mão abrir `?bench`.
