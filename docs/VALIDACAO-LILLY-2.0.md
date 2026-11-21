# Validação — Lilly 2.0

Deusa da Música e da Vibração. Remasterização do pedido #49, feita
sobre o `docs/PLANO-LILLY-2.0.md` publicado antes de qualquer linha de
código.

Base do ramo: `accc2fa` (`main`).

---

## 1. O que mudou, em uma frase cada

| Peça | Antes | Depois |
|---|---|---|
| Cabelo | `rabo`, azul-claro `#7fd6ff`, compartilhado | `onda`, exclusivo: queda longa escura com ponta acesa |
| Traje | `esportivo`, compartilhado | `sonora`, exclusivo: vestido longo de vidro com coroa de frequência |
| Fones | acessório `fones`, genérico, herdado por habitantes | remasterizados em vidro escuro com anel aceso, nascidos no penteado |
| Aura / paleta | `#8fd6ff` / azul-violeta | `#2ee8c0` / turquesa e limão sobre escuro |

A ficha nova é
`look('#cf8f63','onda','#161b2a','#b98cff','sonora','#171a26','#121520','#29c8ff','nenhum',1.0)`.
Pele e olhos violeta são traço original e não foram tocados.

### Paleta: a imagem venceu o texto

A seção 3 do pedido pedia acabamentos em rosa, violeta e branco. A
imagem de referência anexada mostrava o oposto: massa quase preta,
mechas neon verde-ciano, acentos magenta. Perguntado, o Criador
decidiu pela **imagem**, e também rejeitou um híbrido que preservaria
o ciano canônico `#8fd6ff`. É a imagem que está implementada.

---

## 2. Desempenho

Medido com `npx vite-node` sobre a malha construída, não estimado.

| Personagem | baixa | media | alta | ultra |
|---|---|---|---|---|
| padrão | 6 118 t / 4 263 v | 10 694 / 6 935 | 17 818 / 11 163 | 62 224 / 36 050 |
| **Lilly 2.0** | **6 768 t / 4 726 v** | 12 736 / 8 862 | 21 074 / 13 832 | 73 184 / 43 411 |
| Nexara 2.0 | 6 420 / 4 226 | 11 632 / 7 170 | 19 422 / 11 620 | 69 336 / 38 827 |
| Suki 2.0 | 6 592 / 4 914 | 12 320 / 8 282 | 20 758 / 13 346 | 74 032 / 43 253 |
| Luma 2.0 | 7 028 / 4 122 | 12 404 / 7 022 | 20 706 / 11 494 | 73 640 / 39 265 |

**Teto exigido no LOD baixo: 7 145. Resultado: 6 768 — folga de 377.**
É o segundo menor entre as quatro deusas remasterizadas.

A folga existe porque o que é caro está atrás de `detail.segments >= 14`:
no LOD de longe não há coroa de frequência, não há fones, não há
ranhuras e a queda do cabelo tem 6 anéis em vez de 38. O LOD de longe
é o que roda com dezenas de habitantes em cena ao mesmo tempo.

### Chamadas de desenho: paridade exata

| padrão | Lilly | Luma | Nexara |
|---|---|---|---|
| 3 malhas | **3 malhas** | 3 malhas | 3 malhas |

Coroa, fones e costuras são geometria mesclada no corpo, presas a osso
pelo atributo de pele. Um objeto à parte seguindo a cabeça custaria uma
chamada por personagem em cena. Há caso de teste para isso.

### Transição de LOD

Os quatro níveis constroem, e a contagem cresce monotonicamente de
`baixa` a `ultra` — há caso de teste. Nenhuma peça aparece ou some
fora dos limiares documentados.

---

## 3. Materiais: nada novo foi introduzido

Nenhum shader, nenhum passe, nenhum acabamento novo. A Lilly usa o que
a Nexara deixou pronto:

- `Finish.Glass` no traje, nos fones e no cinto;
- `Finish.Holo` (emissão `0,55`) no cabelo aceso, na coroa, nas
  costuras e no cristal da fivela;
- `Finish.Hair` na raiz escura.

`FINISH_EMISSIVE` e as outras seis tabelas de `BodyFinish.ts` não foram
tocadas.

### Sincronia com frequência de áudio: não existe infraestrutura

O pedido manda investigar, e a investigação foi feita antes de
implementar. `src/systems/AudioSystem.ts` (579 linhas) sintetiza som
por Web Audio e expõe `setMusicActive(active)`, mas **não tem
`AnalyserNode`, `createAnalyser` nem `getByteFrequencyData`**. Não há
análise de espectro no motor.

Inventar uma API seria contrariar o próprio pedido. A alternativa
implementada é honesta: a forma de onda está **congelada na malha** —
as alturas das barras vêm de duas senoides amostradas, não de um
sorteio, e por isso o conjunto lê como uma leitura de espectro e não
como ruído. Custo em tempo de execução: zero.

Se um dia existir análise de frequência, o canal para animá-la já
existe e está identificado: `avatarFill` (`src/player/Avatar.ts`), o
uniforme de brilho por quadro do shader do avatar.

---

## 4. Exclusividade

### O catálogo

| | no catálogo global | no sorteio dos habitantes |
|---|---|---|
| `onda` | sim | **não** |
| `sonora` | sim | **não** |

Mil habitantes sorteados com semente fixa não vestem nem um nem outro
— há caso de teste. O que já era exclusivo da Luma, da Suki-Chan e da
Nexara (`cascata`, `fluxo`, `aurora`, `rede`, `docente`) continua
protegido.

### Os fones, que eram a armadilha

`fones` está em `CITIZEN_ACCESSORIES`: é acessório que habitante
herda. Remasterizá-lo no lugar onde ele mora teria mudado a cabeça de
todo habitante sorteado com ele.

Por isso os fones da Lilly **nascem dentro do penteado**, e a ficha
dela usa `accessory: 'nenhum'`. O acessório compartilhado não foi
tocado — e isso está provado por hash abaixo.

### Prova de isolamento por hash

`git worktree add /tmp/base accc2fa`, as duas árvores construídas pelo
mesmo script, SHA-1 sobre `position`, `normal`, `aFinish`, `color` e o
índice, nos **quatro LODs**:

| construção | baixa | media | alta | ultra |
|---|---|---|---|---|
| luma | `e7a52636270dfd02` | `dd5258470a7a1337` | `87a57621a0fdf3b5` | `27628fa5b04ce4ab` |
| suki | `345814ce17444288` | `6639d0dd812e1c1c` | `27e410fbf0e2c575` | `4b430a6cc489599d` |
| nexara | `36d9d7a18249e12f` | `bfe7c075676d3d11` | `006010b9faa00191` | `5c58a7398ebbc6d5` |
| aerion | `c99d80bb40a5cf15` | `052577cce5641af0` | `e9ece0c8db1ac03a` | `0dfe47d294eb3a72` |
| amara | `1479b689bdb038e7` | `330d955d9da35e9f` | `2878f3394d7f839e` | `2036fe333adbafa3` |
| haru | `143b010ecf9c3c8d` | `bb8940ac2173315b` | `311693ec1453c7e7` | `6083b1f5e9c211e6` |
| akemi | `1b6d64ed8731c88f` | `1071875bedb7651c` | `7026b6b519deefc0` | `a08c2e10741a6266` |
| saturno | `e5e1f1176fb1e6e6` | `5bf4b13d3af6ab21` | `7168fc322a551928` | `3ecf5a6083b00be8` |
| maze | `f1500d654532c510` | `7c9552f8c9a50303` | `f98e2798266d6837` | `488528cdeeddacad` |
| jupiter | `5147bd9f5e721719` | `36cdcbe0354d0622` | `c16ac4f0b48501d2` | `2cb803ae5cd8c204` |
| **habitante com `fones`** | `07531828cc817cbd` | `e47323dd471a320c` | `1d2158d633a8bfeb` | `f00d04ea3d9aa623` |
| habitante com `vestido` | `89270e6f74b84010` | `1ebaf6334cb0916e` | `345cd71a27a04625` | `0fd2b4e957212475` |
| habitante com `aurora` | `e7a52636270dfd02` | `dd5258470a7a1337` | `87a57621a0fdf3b5` | `27628fa5b04ce4ab` |
| habitante com `rede` | `74b5300398bb20c1` | `22f02eae56bd18b9` | `a4c833f7b6da0dad` | `78979bcf542c1dfd` |

**14 construções, 56 hashes, todos idênticos entre `accc2fa` e este
ramo.** Luma, Suki, Nexara, Aérion e Amara estão visualmente idênticas
porque são, byte a byte, a mesma malha.

---

## 5. Defeitos encontrados na bancada e como foram corrigidos

Cada item abaixo apareceu numa captura, foi medido com um probe e só
então corrigido. Os números são o que o probe devolveu.

### 5.1 O capuz verde

Primeira captura: a personagem com um capuz verde que engolia o queixo
e o ombro. O degradê abria no alto, e na altura do pescoço (`t ≈ 0,55`)
já ia em **90% de limão** — justamente a faixa mais visível de frente.

Corrigido descendo a rampa: o neon começa abaixo da linha do ombro e
cresce até a ponta, parando em `0,88` para sobrar fundo escuro por
baixo. Depois do teste de frente a rampa desceu de novo, porque o verde
**vazava pelo vão entre o braço e o tronco** e lia como mancha de
defeito no quadril. Hoje o brilho vive no terço final.

### 5.2 O degradê em listras

De costas, o degradê saía como cinco listras horizontais de borda
dura — um bolo de camadas.

Causa, encontrada no código compartilhado: `blendStations` **não
interpola cor**, ela trava na estação mais próxima
(`t > 0.5 ? 1 : 0`). O número de faixas de cor é o número de anéis de
controle; subdividir não acrescenta nenhuma.

### 5.3 O neon que não acendia — o defeito mais sério do marco

Um caso de teste escrito para afirmar "a ponta acende" falhou: **zero**
vértices `Holo` no cabelo inteiro.

Causa: `blendStations` também **descarta `finish`**. Ela copia `zone` e
`origin` da estação vizinha e deixa o acabamento cair para o padrão da
superfície. Declarar `Finish.Holo` num anel que depois passa por
`subdivideProfile` não acende nada — a cor neon ficava lá, chapada, sem
emissão nenhuma.

Essa função é lida por todo corpo do Éden e **não foi tocada**: mexer
nela mudaria o material de todas as personagens de uma vez, e isso
quebra o isolamento exigido.

A saída foi não subdividir o cabelo da Lilly. O perfil dela já é
analítico, então nasce direto na densidade final (38 anéis em ultra,
26 em alta, 6 no LOD de longe). Isso resolveu as três coisas de uma
vez: a cor ficou contínua, o acabamento sobreviveu, e **ficou mais
barato** — o custo em ultra caiu de 76 616 para 73 184 triângulos.

> Observação para marcos futuros: esse descarte de `finish` é um
> defeito latente do motor, não da Lilly, e afeta qualquer varredura
> subdividida que declare acabamento por anel. Corrigi-lo mexe em todo
> mundo e por isso **não** entra neste PR; fica registrado aqui.

### 5.4 O cabelo atravessando os braços

Alargar a queda sem recuá-la fez o cabelo entrar nos braços. Medido,
antes da correção:

| y | cabelo (z máx) | braço (z mín) | folga |
|---|---|---|---|
| 0,35 | −0,019 | −0,062 | **−0,042** |
| 0,25 | −0,018 | −0,053 | **−0,033** |
| 0,10 | −0,033 | −0,050 | **−0,018** |

É o mesmo acidente que matou o véu longo da Nexara: os braços caem em
`x` de 0,13 a 0,28 e a face de trás deles fica perto de `z = −0,05`.

Corrigido recuando a metade de baixo da queda para `−0,55·R`, voltando
a encostar na cabeça só depois de `t = 0,45`. Depois da correção:

| y | cabelo (z máx) | braço (z mín) | folga |
|---|---|---|---|
| 0,38 | −0,078 | −0,064 | **+0,014** |
| 0,23 | −0,070 | −0,052 | **+0,018** |
| 0,13 | −0,078 | −0,050 | **+0,027** |

Pior folga: **+0,013**. Há caso de teste.

### 5.5 A coroa de frequência construída dentro da saia

A coroa nasceu no quadril, em raio `hipWidth · 1,1 = 0,18`. Medida
depois: nessa faixa o manto tem raio **0,24**. O equalizador inteiro
estava dentro do tecido — construído, pago em triângulos e invisível.

Corrigido descendo a coroa para a linha da coxa e pousando-a na
superfície do cone, com cada barra inclinada no mesmo ângulo dele
(`0,62`, medido na malha, não estimado — o primeiro palpite de `0,50`
ainda afundava a ponta das barras longas). Depois:

| y | coroa | manto | sobra |
|---|---|---|---|
| −0,10 | 0,255 | 0,235 | +0,020 |
| −0,15 | 0,281 | 0,246 | +0,035 |
| −0,20 | 0,305 | 0,276 | +0,029 |

Há caso de teste que refaz essa comparação.

### 5.6 O tutu de tule

As barras interpolavam ciano em magenta conforme a altura. O caminho
entre essas duas cores no espaço RGB passa pelo **cinza-lavanda**:
metade da coroa saía lilás desbotado. Somado à emissão de `Holo`, o
resultado era rosa-bebê.

Corrigido em dois movimentos: três degraus discretos da paleta no lugar
do degradê, e todas as cores escurecidas antes de entrar, porque a
emissão já as levanta de volta. E a densidade subiu de 20 para 30
barras — com seis centímetros de vão entre uma e outra, o que se via
era confete, não espectro.

### 5.7 Os fones brancos

Em gelo claro (`0xdff3ff`), arco e conchas eram a coisa mais clara da
personagem inteira: num traje escuro, o acessório virava o assunto.

Corrigido para vidro escuro com um anel ciano aceso — que é
literalmente o que o Criador pediu, "vidro e luz". O casco recua e o
que brilha é só a luz.

### 5.8 O balão e o babador

A queda ia de `1,18·R` na calota a `0,58·R` na ponta: de costas, um
balão fechando num bico. Largura quase constante resolveu a silhueta,
mas aí a ponta virou um **bloco aceso de fundo chato** — um babador
luminoso. Hoje a ponta fecha em 28% da largura e o brilho vira mecha.

### 5.9 A fresta na nuca

Tirar a subdivisão deixou o perfil andar em corda entre um anel e o
seguinte, e a corda passa por dentro da curva: apareceu pele num
azimute das costas. Resolvido densificando a queda (30 → 38 anéis em
ultra, 18 → 26 em alta).

---

## 6. Cobertura da nuca — traçado de raios

4 131 raios por personagem, azimutes de 100° a 260° (180° = costas
exatas), elevações de −20° a 60°, sobre a malha construída. Conta
quantos raios da metade de trás alcançam **pele**.

| | total | nas costas (120°–240°) |
|---|---|---|
| Nexara | 0 | 0 |
| **Lilly** | **191** | **0** |
| Suki | 195 | 97 |
| Luma | 318 | 192 |

Os 191 da Lilly estão todos em `az = 100°, 110°, 250°, 260°` — dez
graus passando do perfil puro, onde o que o raio alcança é a
**bochecha**. Ver a bochecha de lado é o comportamento correto; foi
justamente cobrir a bochecha que produziu o capuz da primeira captura.
Nas costas de verdade a cobertura é total, melhor que a da Luma e a da
Suki, que estão em produção.

---

## 7. Portão de validação

| Etapa | Resultado |
|---|---|
| `npx tsc --noEmit` | **limpo** |
| `npx vitest run` (suíte completa) | **1 156 passam**, 11 pulados, **1 falha** |
| `tests/unit/lilly-remaster.test.ts` | **25 / 25** |
| `npm run build` | **✓ em 551 ms** |
| Render WebGL2 | ANGLE / SwiftShader, 9 capturas, `ERROS: nenhum` em todas |
| Perfis de qualidade | `baixa→baixa · media→media · alta→alta+pbr · ultra→ultra+pbr` |

### A falha é pré-existente e está provada como tal

`tests/unit/coracao-roseiral.test.ts > nenhum habitante nasce dentro,
nem vai parar lá em dois minutos de parque` — estoura o teto de 5 s do
Vitest.

Reproduzida na **base limpa** `accc2fa`, fora deste ramo, via
`git worktree`: `1 failed | 33 passed`, exatamente o mesmo caso. Não
tem relação com a Lilly, não foi mascarada e nenhum teste fora do
escopo foi alterado.

---

## 8. Capturas

Em `docs/validacao/lilly/`:

| arquivo | o que mostra |
|---|---|
| `antes-corpo.png` | Lilly original: rabo azul-claro, traje esportivo, fones genéricos |
| `antes-costas.png` | costas do original |
| `antes-rosto.png` | rosto do original |
| `depois-corpo.png` | frente: silhueta escura, coroa de frequência, cinto de cristal |
| `depois-costas.png` | costas: a queda inteira com o degradê contínuo e a ponta acesa |
| `depois-perfil.png` | perfil: comprimento, fone de vidro e luz, coroa na barra |
| `depois-rosto.png` | rosto: olhos violeta preservados, traços originais |
| `depois-andando.png` | em movimento, sem instabilidade na malha |
| `depois-noite.png` | noturno: o que emite, emitindo — olhos, anel do fone, cristal |

O "antes" foi reconstituído na própria bancada com `setAppearance`
sobre a ficha canônica anterior
(`look('#cf8f63','rabo','#7fd6ff','#7a5cc9','esportivo','#1b82ea','#2e3a4f','#29c8ff','fones',1.0)`),
no mesmo enquadramento e na mesma iluminação do "depois".

---

## 9. Integração

| Sistema | Situação |
|---|---|
| Panteão | ficha atualizada no lugar; ordem e domínios intactos |
| Bancada (`lab.html`) | `Lilly` acrescentada ao seletor de deusa |
| EdenOS / EdenPhone / EdenMusic | sem mudança de contrato: a Lilly é a mesma entrada de panteão, com a mesma `id`, `handle` e lugar |
| Animação | osso `Bone.Hips` para a coroa, `Bone.Head` para os fones, mistura com `Bone.Torso` na queda do cabelo |
| Iluminação | só acabamentos existentes; verificado de dia e de noite |
| Áudio | nenhuma API nova; ver seção 3 |

---

## 10. Fora de escopo

Não entraram neste PR, de propósito:

- o descarte de `finish` em `blendStations` (seção 5.3) — é do motor,
  afeta todas as personagens e merece PR próprio;
- o `coracao-roseiral` flaky (seção 7) — pré-existente, investigação já
  encerrada em marco anterior;
- qualquer outra deusa;
- qualquer mudança no `main`.
