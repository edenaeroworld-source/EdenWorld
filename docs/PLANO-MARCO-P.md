# Marco P — EdenPhone lateral e prévia 3D do personagem

O celular do Éden Aero deixa de ser uma tela que engole o jogo e passa
a ser um aparelho que se tira do bolso. Ele encosta numa lateral, o
mundo continua rodando atrás dele, e dentro da sua moldura o
personagem que você controla aparece em três dimensões, de verdade,
atualizando-se enquanto você mexe nos controles.

A inspiração declarada foi o uso lateral do celular em GTA V. O que
muda aqui é a identidade: nada de retângulo fosco colado na borda —
vidro, transparência e luz aqua, no mesmo vocabulário Frutiger Aero do
resto do jogo, com o personagem flutuando numa projeção sem fundo.

---

## 1. O problema real: modalidade

A primeira descoberta não foi de estilo, foi de arquitetura. O
`EdenPhoneUI` era uma `Screen` comum empilhada no `UIManager`, e é
exatamente a pilha do `UIManager` que congela o jogo:

```ts
get hasModal(): boolean { return this.stack.length > 0; }
```

Esse booleano é consultado em cinco lugares do `Engine`: desliga os
comandos (`syncInputState`), zera a intenção de movimento, o olhar e o
zoom (`frame`), bloqueia `pause()` e `openPhone()`, e impede iniciar
uma conversa. Qualquer tela aberta — inclusive o celular — paralisava
tudo.

Logo, deixar o celular lateral **não é uma questão de CSS**. Era
preciso dar à interface uma segunda forma de existir: uma tela que
convive com a gameplay em vez de interrompê-la.

### A solução: telas conviventes

`Screen` ganhou um campo opcional:

```ts
readonly blocking?: boolean;   // false = convive com o jogo
```

e `hasModal` passou a perguntar quem de fato bloqueia:

```ts
get hasModal(): boolean { return this.stack.some((s) => s.blocking !== false); }
```

Três consequências, todas intencionais:

- **O significado global não mudou.** Uma tela que não declara nada
  continua modal. Menu, pausa, criador de avatar, diálogos: tudo
  congela o jogo como sempre congelou. Só quem pede para conviver
  convive.
- **`open()` não torna inerte quem está embaixo** quando a tela nova é
  conviva, e **não rouba o foco** — abrir o celular no computador não
  pode engolir o próximo `W`.
- Ficaram disponíveis `hasScreen` (há qualquer tela aberta) e
  `topBlocking` (a tela do topo que de fato captura comandos), para
  quem precisa da distinção.

---

## 2. A prévia: por que um segundo renderizador

O requisito mais importante do marco era mostrar **o personagem do
jogador**, com a aparência e as proporções atuais, dentro da interface
e com fundo transparente.

A cena do mundo é desenhada num canvas que fica **atrás** de toda a
interface, com `alpha: false` e `setClearColor(0x9fdcff, 1)`. Recortar
o personagem nela com scissor o colocaria sobre a paisagem, não sobre
o vidro do aparelho, e não haveria transparência alguma — a cor de
fundo do mundo viria junto.

Então `CharacterPreview` cria um renderizador pequeno e próprio:

```ts
export const PREVIEW_RENDERER_OPTIONS = {
  alpha: true,          // o requisito de fundo transparente mora aqui
  antialias: true,
  depth: true,
  stencil: false,
  powerPreference: 'low-power',
} as const;
```

com `setClearColor(0x000000, 0)` — alfa zero, nada de caixa preta.
O canvas vira só mais um elemento do celular: o vidro aqua aparece por
trás do personagem e as luzes de varredura passam por cima.

### O que é e o que não é compartilhado

| | compartilhado | por quê |
|---|---|---|
| Aparência, proporções, gestação, expressão | **sim**, lidos do `player.avatar` a cada quadro | a prévia não guarda cópia; pergunta e reconstrói quando a resposta muda |
| Transformação dos Afters | **sim**, o mesmo `AftersActor` | ver §3 |
| Classe e código do corpo | **sim**, a mesma `Avatar`/`BodyBuilder` | nada de modelo paralelo |
| Simulação (física, colisão, motor) | **não** | a prévia só anima e desenha |
| Sombras | **não** (`setShadows(false)`) | não há chão para receber sombra |
| Geometria e materiais em GPU | **não** | contextos WebGL distintos não compartilham buffers; e uma malha com esqueleto precisa do próprio esqueleto |

A última linha é o custo honesto da decisão: um segundo corpo (~17 mil
triângulos) e três materiais, criados **só quando o celular é aberto
pela primeira vez** — um contexto que nunca foi aberto não é criado.
Em troca, a prévia é transparente de verdade, é isolada da cena
principal e não corre risco de interferir no desenho do mundo.

### Orçamento

- **30 quadros por segundo**, não 60. O `Engine` acumula o tempo e só
  chama a prévia quando o intervalo fecha; o mundo continua a 60.
- **Densidade de pixel limitada a 2×**, numa janela de ~230×290.
- **Nenhum quadro quando o celular está fechado** — `stop()` no
  `onClose`, e o avatar fica montado para reabrir sem piscar.
- **Sem área, sem desenho**: durante a animação de saída o `resize()`
  devolve `false` e nada é renderizado.
- **Contexto perdido não derruba o celular**: `webglcontextlost`
  desliga a prévia, a janela some e o aparelho continua inteiro.

### Enquadramento proporcional

Um enquadramento fixo cortaria o personagem mais alto (1,91 m de topo
de cabeça) ou deixaria o mais baixo (1,56 m) perdido no meio da
janela. A câmera é posicionada em frações da altura do próprio
personagem:

```
FRAME_TOP = 1.10   FRAME_BOTTOM = 0.24   fov = 32°
meia-altura = (TOP − BOTTOM)/2 · topo      centro = (TOP + BOTTOM)/2 · topo
distância   = meia-altura / tan(16°)  ≈  1,50 · topo
```

Todo mundo aparece igual: da cabeça — com um palmo de folga — até os
joelhos. A câmera olha **na horizontal**; inclinar encurtaria as
pernas. Giro de vitrine de ±31° a cada ~14 s, que mostra o perfil sem
nunca dar as costas.

---

## 3. Afters: proibido um segundo sistema de transformação

O requisito era explícito, e é o ponto em que uma prévia costuma
mentir: ela recalcula a silhueta por conta e, mais cedo ou mais tarde,
diverge do personagem real.

Aqui não há recálculo nenhum. O `AftersActor` do jogador já mantinha
uma lista de corpos e escrevia neles a cada quadro:

```ts
private push(): void {
  const bust = this.bust.current;
  const curve = this.curve.current;
  for (const avatar of this.avatars) avatar.setMorph(bust, curve);
}
```

A prévia simplesmente **entra nessa lista**, por
`aftersBody.addAvatar(avatar)`. Não existe caminho pelo qual a prévia
obtenha um valor de Afters que o personagem do mundo não tenha
recebido no mesmo quadro, com os mesmos parâmetros — é literalmente a
mesma atribuição, no mesmo laço.

Disso decorre tudo o que o marco pedia, sem código adicional:
atualização enquanto o controle é arrastado, valores e estados
ativo/inativo preservados, efeitos combinados, e nada de fechar e
reabrir. O teste que prova a ausência de um segundo sistema é o
inverso: ao tirar o corpo da prévia do ator, a silhueta dela zera —
porque ela nunca calculou nada sozinha.

Dois detalhes de costura:

- **Trocar de roupa** remonta o corpo. O novo entra no ator
  imediatamente (`addAvatar` já faz um `push`), então a silhueta
  escolhida não pisca para neutro.
- **Viajar de região** refaz o ator com `setAvatars([player.avatar])`.
  O `Engine` chama `preview.reattach()` logo em seguida, senão a
  prévia continuaria viva com a silhueta congelada.

---

## 4. Controles: de quem é a tecla

Com o jogo rodando e uma interface aberta ao mesmo tempo, cada entrada
precisa de dono. As regras:

| situação | comportamento |
|---|---|
| Tecla do EdenPhone (`Tab`/`P`, configurável) | **alterna**: abre e fecha |
| Foco dentro do aparelho, teclas de jogo | ignoradas — as setas são do controle deslizante, `Tab` é do foco |
| Foco dentro do aparelho, `Tab`/`Esc` | passam: ninguém fica preso lá dentro |
| `Esc` com o celular aberto | sobe um nível no aplicativo; no topo, guarda o aparelho |
| Mouse | o cursor é **solto** enquanto o celular está aberto (`setPointerLockAllowed(false)`); capturado, o ponteiro sumiria |
| Toque num aplicativo | o celular é DOM acima do canvas: o evento nunca chega ao mundo, e o personagem não sai andando |
| Botão de toque dedicado | já existia (`touch-btn--phone`) e agora alterna |
| Gamepad | o botão mapeado para `phone` abre e fecha; os analógicos continuam sendo do personagem |
| Mira de interação | desligada com o celular aberto — um `E` não pode abrir uma porta enquanto se digita no EdenTalk |

A distinção "foco dentro do aparelho" é feita por um atributo no
elemento (`data-live-ui`) e uma checagem de `closest()` no
`KeyboardMouseInput`. Vale para qualquer interface conviva futura, não
só para o celular.

---

## 5. Lado, animação e espaço

- **Lado configurável** (`Ajustes → Jogo → Lado do EdenPhone`),
  gravado no salvamento como `gameplay.phoneSide`. Trocar vale na
  hora, com o aparelho já aberto.
- **Entrada e saída deslizando pela lateral certa**, com quatro
  animações (entra/sai × direita/esquerda) e `prefers-reduced-motion`
  respeitado.
- A saída precisou de um detalhe no `UIManager`: `exitMs`. A tela sai
  da pilha **na hora** — o jogo volta a responder no mesmo quadro — e
  o elemento fica mais 260 ms, inerte, só para deslizar para fora.
  Reabrir no meio da animação cancela a saída em vez de duplicar o nó.
- **O HUD e os controles de toque se afastam** do lado ocupado
  (`ui--phone`, `ui--phone-left` na raiz da interface), em vez de
  disputarem o canto. Andar, pular e interagir continuam alcançáveis.
- **Em retrato** o aparelho ocupa uma faixa maior, mas nunca a tela
  inteira: o mundo continua à vista do outro lado.

---

## 6. Aplicativos

Nenhum aplicativo foi reconstruído. Os dez pedidos — EdenGram,
EdenTalk, EdenFeed, EdenReads, EdenMusic, EdenStore, EdenTravel,
Pessoas, Afters e EdenPawl — continuam sendo desenhados pelas mesmas
funções de `EdenApps.ts` e `UniverseApps.ts`, dentro da mesma área de
conteúdo. O que mudou foi a moldura ao redor.

Duas adaptações ao formato:

- A janela da prévia mora **no aparelho**, acima da tela, não dentro
  de um aplicativo. Navegar entre aplicativos não a recria nem recria
  o contexto WebGL.
- No aplicativo de Afters ela **cresce** (`phone-preview--tall`), que
  é onde o corpo é o assunto e o jogador precisa ver o efeito enquanto
  arrasta o controle.

E o estado é preservado: `prepare()` sem argumento retoma o aplicativo
em que o celular foi guardado, inclusive a conversa aberta no EdenTalk
e o texto aberto no EdenReads. Guardar o aparelho no meio de uma
leitura e tirá-lo de novo cai na mesma página. Abrir direto num
aplicativo (um portal, o holomapa, o painel de eventos) continua
funcionando e ignora o retomar.

---

## 7. Testes

`tests/unit/edenphone-lateral.test.ts` — **55 casos**, organizados nos
dez grupos pedidos:

1. **Abrir durante a gameplay** — o celular entra na interface sem
   tornar o jogo modal; uma tela modal continua modal; não apaga nem
   rouba o foco de quem já estava aberto; é faixa lateral, não tela
   cheia; direita por padrão, esquerda quando mandam.
2. **Fechar e reabrir** — dez ciclos deixam a pilha limpa; reabrir
   retoma o aplicativo guardado; abrir direto ignora o retomar; a
   animação de saída não deixa o elemento preso; reabrir no meio da
   saída não perde o aparelho.
3. **Alternar entre aplicativos** — os dez abrem e desenham conteúdo;
   navegar não recria a janela da prévia; ela cresce em Afters.
4. **O personagem aparece** — é um `Avatar` de verdade, com a mesma
   aparência, as mesmas proporções e as mesmas medidas do corpo do
   mundo; o enquadramento mostra da cabeça aos joelhos e acompanha a
   altura; o giro não vira rodopio; luz própria e zero sombras;
   desligada não gasta um quadro; sem área não desenha.
5. **Afters em tempo real** — o mesmo ator escreve nos dois corpos com
   os mesmos valores; acompanha passo a passo do controle deslizante;
   desligar preserva o valor; os dois canais juntos aparecem juntos;
   **sem o ator, a prévia não tem silhueta** (prova da ausência de um
   segundo sistema).
6. **Trocar de roupa** — remonta o corpo, sem corpo órfão no ator, sem
   perder a silhueta escolhida, e sem remontar quando nada mudou.
7. **Viajar** — a viagem fecha o aparelho e devolve o jogo; depois ele
   volta onde estava; a região nova reconstrói o ator e a prévia é
   reencontrada; viajar com o celular fechado não acorda a prévia.
8. **Controles** — tecla configurável com padrão; a tecla chega como
   ação com o jogo rodando; o foco no aparelho não faz o personagem
   andar, mas `Tab` e `Esc` continuam saindo; fora do aparelho as
   teclas voltam a ser do personagem; o cursor é solto; o botão de
   toque dedicado vale mesmo parado; tocar num aplicativo não chega ao
   mundo; `Esc` sobe um nível antes de guardar; há botão de fechar na
   moldura.
9. **Fundo transparente** — o contexto é pedido com alfa; a limpeza é
   com alfa zero; a cena não tem fundo nem névoa; o canvas não ganha
   fundo opaco; a janela não é painel sólido; sem WebGL ela some em
   vez de virar um retângulo vazio.
10. **Fechar devolve a gameplay** — a pilha esvazia, nada fica inerte,
    o foco não fica preso num botão; a prévia para e religa; fechar
    com uma modal por baixo devolve a modal, não o jogo; descartar
    solta o corpo do ator; contexto perdido não derruba o celular.

**Campanha de mutação: 16 mutações, 16 mortas.** Entre elas:
`blocking = true`, `hasModal` de volta a "pilha não vazia",
`setClearColor` com alfa 1, `alpha: false` nas opções do contexto,
`prepare()` perdendo o estado, `onClose` não parando a prévia, as
teclas de jogo passando por cima do foco, a prévia não se registrando
no ator (13 casos mortos), roupa não remontando o corpo, prévia parada
continuando a desenhar, `open()` tornando inerte a tela de baixo,
elemento de saída nunca removido, enquadramento fixo, câmera perto
demais, rodopio completo e sombras ligadas.

`tests/unit/edenphone-render.test.ts` — folha de conferência visual
(`EDEN_RENDER=1`), em `docs/edenphone-previa.png`: os ângulos do giro,
as duas alturas extremas lado a lado (composição idêntica), vestido e
cabelo longo, e os quatro estados de Afters.

---

## 8. Arquivos

**Novos**

| arquivo | o que é |
|---|---|
| `src/interface/CharacterPreview.ts` | a prévia 3D: renderizador com alfa, enquadramento proporcional, ciclo de vida do avatar |
| `tests/unit/edenphone-lateral.test.ts` | os 55 casos dos dez grupos |
| `tests/unit/edenphone-render.test.ts` | folha visual |
| `docs/edenphone-previa.png` | a folha gerada |
| `docs/PLANO-MARCO-P.md` | este documento |

**Modificados**

| arquivo | mudança |
|---|---|
| `src/interface/UIManager.ts` | `blocking`, `exitMs`, `hasScreen`, `topBlocking`; `hasModal` conta só quem bloqueia; `open`/`close` respeitam telas conviventes |
| `src/interface/EdenPhoneUI.ts` | `blocking = false`, lado configurável, moldura lateral, botão de fechar na borda, janela da prévia, `prepare()` que retoma |
| `src/interface/HUD.ts` | `setPhoneOpen(open, side)`: marca a raiz e acende o botão do celular |
| `src/interface/SettingsScreen.ts` | opção "Lado do EdenPhone" |
| `src/input/KeyboardMouseInput.ts` | `setPointerLockAllowed`, e teclas de jogo cedem o passo dentro de `[data-live-ui]` |
| `src/input/InputManager.ts` | repassa `setPointerLockAllowed` |
| `src/systems/SaveSystem.ts` | `PhoneSide` e `gameplay.phoneSide`, com validação |
| `src/core/Engine.ts` | constrói a prévia, liga-a ao ator de Afters, `togglePhone()`, `syncPhonePresence()`, `updatePreview()` a 30 fps depois dos sistemas, cursor solto, mira desligada, `Esc` que sai do celular |
| `src/styles/main.css` | `.screen--phone`, `.phone--side`, `.phone__dismiss`, `.phone-preview`, as quatro animações, deslocamento do HUD e dos controles de toque, retrato e `prefers-reduced-motion` |

---

## 9. Portão

```
npx tsc --noEmit     →  0 erros
npx vitest run       →  1017 passaram | 8 pulados  (48 arquivos | 3 pulados)
npm run build        →  ✓ 566 ms
```

(Este repositório não tem `npm run lint`.)

Validação visual: o servidor de desenvolvimento foi levantado e a
folha `docs/edenphone-previa.png` foi gerada e inspecionada — o
enquadramento é idêntico nas duas alturas extremas, a cabeça tem folga
e os quatro estados de Afters se distinguem.
