# Luma — Eden Aero Character Remaster 2.0

Remaster da Luma, Deusa do Corpo e da Silhueta Viva, a partir da arte
oficial **“LUMA — EDEN AERO”**.

A regra do marco não era “ficar bonita”: era **continuar sendo ela**.
Tudo o que define a personagem no mundo — quem ela é, o que assina,
onde mora, a silhueta que mostra no Ateliê, o esqueleto que anima —
está igual. O que mudou foi a leitura visual, e cada mudança saiu de
um atributo da arte de referência, não de gosto.

## O que mudou, atributo por atributo

| | antes | depois | de onde veio |
|---|---|---|---|
| cabelo (estilo) | `longo` (queda lisa) | **`ondulado`** (novo) | ondas largas da arte |
| cabelo (cor) | `#ff8fc0` rosa | **`#a855f7` roxo** | arte |
| olhos | `#7a5cc9` violeta | **`#3b2a20` castanho** | arte |
| pele | `#ffe0c8` clara | **`#cf8f63` morena** | arte |
| traje | `vestido` rosa | **`aurora`** — Manto Aurora (novo) | macacão/vestido de vidro líquido |
| acessório | `flor` | **`cristal`** (novo) | brincos de gota azul-ciano |
| paleta da ficha | `#ffc1d6 / #f0588c` | `#bff4ff / #a855f7` | ciano + roxo |
| **identidade** | | **intacta** | id, nome, título, domínio, Ateliê, Afters 125%/150% |

As duas imagens de referência não têm o mesmo peso: a leitura de
identidade saiu da **arte-chave com a marca “LUMA — EDEN AERO”**
(cabelo, olhos, pele, brincos, vidro líquido, jardim Éden). A outra
referência entrou só como confirmação de rosto e penteado — o
enquadramento dela não se transfere para uma NPC que fica de pé no
Ateliê recebendo visita.

## O Manto Aurora é vidro líquido de verdade

Não é pano pintado de azul. O avatar inteiro sai num desenho só, com
um material só, e o acabamento viaja **por vértice** — então o manto
é um acabamento novo, `Finish.Glass`, e não um material novo:

| acabamento | rugosidade | metal | verniz | iridescência |
|---|---|---|---|---|
| pele | 0,58 | 0 | 0,06 | 0 |
| tecido | 0,88 | 0 | 0 | 0 |
| **vidro líquido** | **0,12** | **0,18** | **1,0** | **1,0** |

A iridescência é a película fina que faz o manto virar arco-íris no
ângulo rasante: é o traço Frutiger Aero que **não** se consegue com
cor de vértice, porque depende do ângulo de visão.

Contagem medida na malha (ultra), por acabamento:

| traje | pele | tecido | cabelo | olho | brilho | **vidro** |
|---|---|---|---|---|---|---|
| `vestido` | 4 474 | 26 981 | 1 365 | 1 712 | — | — |
| `aurora` | 4 474 | **0** | 1 365 | 1 712 | — | **28 733** |
| **Luma** | 4 474 | **0** | 3 962 | 1 712 | 384 | **28 733** |

Zero vértices de tecido no manto: ele é vidro inteiro, e os 384 de
brilho são os brincos.

### O gerador de acabamentos

Acrescentar o sétimo acabamento exigia lembrar de mexer em cinco
funções GLSL de aridade fixa — e elas já tinham divergido uma vez.
Agora o seletor de cada propriedade é **gerado a partir da sua
tabela**, então a tabela e o shader não podem mais discordar.

## Custo

Vértices e triângulos, medidos nos quatro níveis:

| nível | padrão (v/t) | Luma (v/t) | vértices |
|---|---|---|---|
| baixa | 4 263 / 6 118 | 4 122 / **7 028** | −3,3% |
| media | 6 935 / 10 694 | 7 022 / 12 404 | +1,3% |
| alta | 11 163 / 17 818 | 11 494 / 20 706 | +3,0% |
| ultra | 36 050 / 62 224 | 39 265 / 73 640 | +8,9% |

A promessa do nível baixo é não pesar mais que o avatar antigo
inteiro (6 496 triângulos, teto de 7 145,6). A primeira versão da
onda estourava: **7 228**. Os anéis da onda agora caem de 9 para 4 no
nível baixo, onde a onda não sobreviveria à resolução de qualquer
jeito → **7 028**, dentro do teto.

**Nenhuma chamada de desenho nova.** Um teste compara o número de
malhas da Luma com o de um habitante qualquer: tem de ser igual.

## O que não quebrou

- **Esqueleto:** os dezenove ossos, nome por nome, verificados em teste.
- **AfterBust® / AfterCurve®:** continuam valendo nela, e a contagem de
  vértices não muda entre 0% e 250% — o morph é de GPU, como sempre
  foi. Validado em imagem a 250%/250% com o manto.
- **Animação:** caminhando, nenhuma perna atravessa o manto.
- **Saves antigos:** o visual anterior dela (cabelo `longo`, `vestido`,
  `flor`) continua uma aparência válida — ninguém perde o personagem
  salvo porque o canon mudou.
- **Habitantes:** o Manto Aurora **não entra no sorteio** de aparência
  (`CITIZEN_OUTFITS`). Traje divino em cinquenta e quatro pessoas na
  praça deixa de ser traje divino.

## Pendências declaradas

**1. O manto não varre o chão, e isso é física do rigging, não
preguiça.** Na arte, o vestido arrasta na água. Aqui a barra para 10 cm
abaixo da saia curta. O motivo é medido: a folga que a passada exige
cresce com a distância à junta do quadril, porque a coxa gira e o pano
só acompanha metade do giro.

| barra | folga exigida na barra |
|---|---|
| −0,36 (saia curta, como era) | 214 mm |
| **−0,46 (Manto Aurora)** | **277 mm** |
| −0,62 (meia canela) | 378 mm |
| −0,80 (chão) | 491 mm |

A −0,62 o manto precisa abrir 38 cm de cada lado e deixa de ser
coluna: vira crinolina — foi renderizado e confirmado. O vestido que
varre o chão exigiria que a **barra acompanhasse a perna**, isto é,
subir o peso de acompanhamento perto de 1 na barra. Esse peso é lido
dos dois lados (a forma em `BodyBuilder` e a pose em `BodyRig`), e
mudar um sem o outro faz a canela sair pelo tecido. É mudança no
contrato da animação: **aguarda autorização.**

**2. Transparência real.** O vidro líquido é liso, envernizado e
iridescente, mas opaco. Transmissão de verdade (`transmission`) num
corpo fundido exige passe separado e ordenação — é chamada de desenho
e orçamento de WebGL2, justamente o que o marco pede para evitar.

**3. O rosto é o do remaster anterior.** Geometria facial, expressões e
animação natural vieram do marco de personagem 2.0
(`docs/VALIDACAO-CHARACTER-2.0.md`) e não foram tocados aqui.

## Capturas

Todas em WebGL 2.0 de verdade (ANGLE/SwiftShader), mesmo caminho de
render do jogo, `ERROS: nenhum` em todas.

| arquivo | o que mostra |
|---|---|
| `docs/validacao/luma/antes-corpo.png` | a Luma antes do remaster |
| `docs/validacao/luma/antes-rosto.png` | rosto antes |
| `docs/validacao/luma/depois-corpo.png` | depois, corpo inteiro |
| `docs/validacao/luma/depois-rosto.png` | depois, rosto e brincos |
| `docs/validacao/luma/depois-costas.png` | queda do cabelo por trás |
| `docs/validacao/luma/depois-niveis.png` | o manto nos quatro níveis |
| `docs/validacao/luma/manto-afters.png` | manto a 250%/250% |
| `docs/validacao/luma/manto-andando.png` | manto em passada |

A bancada ganhou a cena `luma`, que monta a deusa **como o jogo a
monta**: aparência do panteão e os Afters dela, não o avatar padrão.
Durante o marco isso revelou um defeito da própria bancada — os
Afters por personagem eram sobrescritos pelos controles da interface.

## Portão

```
npx tsc --noEmit   → limpo
npx vitest run     → 1 088 passaram · 11 pulados · 1 falhou
npm run build      → 591 ms
```

A falha é `coracao-roseiral.test.ts`, que já falhava em `main` antes
deste marco (tempo esgotado na navegação do parque) e não tem relação
com a Luma.
