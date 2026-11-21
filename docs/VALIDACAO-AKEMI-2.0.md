# Validação — Akemi-Chan 2.0

Remasterização oficial da **Akemi-Chan, Deusa da Cultura Otaku e do
Fandom**. Branch `arena/9905e7b3-edenworld`, a partir de `35885a1`.

O plano que guiou o marco está em [`PLANO-AKEMI-2.0.md`](PLANO-AKEMI-2.0.md)
e foi publicado **antes** de qualquer geometria ser escrita.

---

## 1. O que mudou

| Arquivo | O quê |
|---|---|
| `src/player/AvatarAppearance.ts` | Penteado `cachos` e traje `cosplay` nos catálogos, **fora** das listas de habitante |
| `src/player/body/BodyBuilder.ts` | Penteado `cachos`, `buildAkemiGlasses()`, `buildCosplaySuit()`, barra própria da saia, meia alta por cor |
| `src/characters/Pantheon.ts` | Ficha da Akemi: cabelo castanho, `cachos`, `cosplay`, `accessory: 'nenhum'` |
| `lab.html` | Akemi-Chan no seletor de deusa da bancada |
| `tests/unit/akemi-remaster.test.ts` | 25 casos novos |

---

## 2. As melhorias, uma a uma

**Cabelo.** Penteado exclusivo `cachos`: queda larga que chega a
`1,34·R` (contra `1,12·R` da Lilly) e **para no ombro**. O cacho não é
geometria — é relevo por `feature()`, que empurra vértices já
existentes e custa **zero triângulo**. São 38 bolhas no ultra,
distribuídas por espiral de ângulo áureo para não agrupar nem deixar
calva. A silhueta é o oposto da Lilly de propósito: ampla em cima,
leve embaixo.

**Óculos.** Aro redondo em `Finish.Glass` lilás, com a lente
**vazada** — aro sem disco opaco dentro, senão lê como óculos de
natação. Hastes a partir de `segments >= 14`, porque é de perfil que
um óculos sem haste denuncia que está flutuando no rosto. Nascem
**dentro do penteado**, não como acessório.

**Traje.** Peça única `cosplay`: gola marinheira que desce das costas,
cruza o ombro e termina num V no peito; laço magenta com nó claro;
haori de lapelas em vidro lilás que **ultrapassa o contorno do
tronco**; faixa de cintura; saia plissada curta com 18 vincos em
relevo; meia alta com vão de pele sob a barra.

**Acessórios de identidade.** Leque de 5 cartões holográficos
(`Finish.Holo`) ao lado dela, como uma mão de cartas aberta. Não são
anéis: anel orbitando o corpo já é a assinatura da Nexara, e repetir o
recurso faria as duas lerem igual.

**Identidade canônica preservada.** `colors`, `aura`, olhos `#7a5cc9`,
pele `#ffe0c8` e altura `0,96` **não foram tocados**. Só o cabelo
mudou de cor, para o castanho da arte de referência.

---

## 3. Triângulos por LOD

| | baixa | media | alta | ultra |
|---|---|---|---|---|
| Avatar padrão | 6 118 | 10 694 | 17 818 | 62 224 |
| **Akemi 2.0** | **6 648** | **14 148** | **22 286** | **73 452** |
| Lilly 2.0 | 6 768 | 12 736 | 21 074 | 73 184 |
| Luma 2.0 | 7 028 | 12 404 | 20 706 | 73 640 |
| Suki 2.0 | 6 592 | 12 320 | 20 758 | 74 032 |
| Nexara 2.0 | 6 420 | 11 632 | 19 422 | 69 336 |

Teto do LOD baixo: **7 145,6**. A Akemi fica em 6 648, com **497 de
folga** — abaixo da Luma e da Lilly.

O primeiro desenho estourou o teto em 402 triângulos. A causa, medida
peça a peça: **uma flor custava quase 400 triângulos sozinha** (cinco
`ball`, cada uma uma varredura de oito segmentos com duas calotas). As
flores e o laço redondo passaram a existir só a partir de `media`; de
longe o laço é três caixas, e a três metros a silhueta é a mesma.

Custo das peças exclusivas no LOD baixo: cabelo **480**, traje **620**.

---

## 4. Chamadas de desenho

**3 malhas: `corpo`, `rosto`, `halo`** — medido em WebGL 2.0 real, na
bancada, via `eden.renderer.info`. Idêntico a todas as outras deusas.

Tudo que o traje e o penteado acrescentam entra na malha única do
corpo por `addGeometry`. Nenhuma peça nova paga chamada de desenho.

---

## 5. Testes

| Portão | Resultado |
|---|---|
| `tests/unit/akemi-remaster.test.ts` | **25 / 25** |
| `npx tsc --noEmit` | limpo |
| `npm run build` | 668 ms, sem aviso novo |
| Suíte geral (`npx vitest run`) | **1 181 passam**, 11 pulados, **1 falha preexistente** |

A falha é `coracao-roseiral.test.ts` → *"nenhum habitante nasce dentro,
nem vai parar lá em dois minutos de parque"*, timeout de 5 s. **Ela
falha igual na base `35885a1` intocada**, verificado em worktree
separada neste mesmo marco. É anterior a este trabalho e **não foi
mascarada**.

---

## 6. Comparação de hashes — o resto do Éden

SHA-1 de `position`, `normal`, `color`, `aFinish`, `skinIndex`,
`skinWeight` e do índice, para cada construção, contra a worktree da
base `35885a1`.

```
aerion    baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
haru      baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
nexara    baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
suki      baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
luma      baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
lilly     baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
saturno   baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
maze      baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
jupiter   baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
amara     baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
(padrão)  baixa:IGUAL  media:IGUAL  alta:IGUAL  ultra:IGUAL
habitantes #0..#11 (sorteados)      todos IGUAL nos 4 LODs

TOTAL: 92 iguais, 0 diferentes  (23 construções × 4 LODs)
```

Nenhum cidadão e nenhuma deusa mudaram. O caso
`nenhum habitante sorteado sai de cachos ou de cosplay` roda **2 000
sorteios** e confirma a mesma coisa pelo lado do catálogo.

---

## 7. Capturas

Em `docs/validacao/akemi/`:

| Arquivo | O quê |
|---|---|
| `01-antes-corpo.png` | Antes, de dia |
| `02-depois-corpo.png` | Depois, de dia |
| `03-depois-rosto.png` | Rosto, de perto |
| `04-depois-costas.png` | Costas |
| `05-depois-perfil.png` | Perfil |
| `06-depois-andando.png` | Andando |
| `07-depois-noite.png` | Depois, de noite |
| `08-antes-noite.png` | Antes, de noite |
| `09-lods.png` | Os quatro LODs lado a lado |
| `10-elenco.png` | Elenco de habitantes — prova visual de que ninguém mudou |

---

## 8. O que a bancada reprovou pelo caminho

Nenhum destes foi encontrado por raciocínio: todos apareceram em
captura e foram corrigidos depois de medir a malha.

1. **Cabelo renderizou liso feito capacete.** O campo de cachos foi
   espalhado num **círculo** de raio `1,2·R`, mas a queda é uma elipse
   rasa — `rz` vale `0,34·R` na frente contra `1,16·R` atrás, e o
   centro recua até `−0,3·R`. Metade das bolhas caiu no ar, longe de
   qualquer vértice. Agora cada bolha é avaliada na mesma
   parametrização do `loft`.
2. **O laço estava dentro do torso.** Ficou em `z = 0,082`; a frente
   do peito está em `z ≈ 0,111`, medido na malha. Existia, custava
   triângulos e era invisível.
3. **A gola saiu branca sobre um torso branco.** Passou a lilás com
   listra magenta — a cor canônica dela.
4. **A gola lia como dois remendos colados no peito.** Faltava a tira
   que passa por cima do ombro: gola marinheira é uma peça só, e é o
   caminho contínuo que o olho reconhece.
5. **O haori lia como suspensório.** As lapelas corriam por dentro do
   contorno do corpo. Casaco só existe como casaco quando ultrapassa a
   silhueta.
6. **A perna inteira lia como coberta.** A barra da saia estava em
   `−0,36`, **abaixo** do cano da meia, e o cano era um degradê de
   7,5 cm entre duas estações. Agora a barra tem valor próprio
   (`−0,26`) e o cano é um degrau de 2 cm.
7. **Os cartões eram invisíveis.** Em leque atrás dos ombros, tapados
   pelo corpo de frente e pela juba no resto.
8. **O plissado não existia em lugar nenhum.** Usava raio fixo; o cone
   da saia muda de raio a cada altura, então o vinco ficava para
   dentro do tecido embaixo e para fora em cima.
9. **A coxa nua renderizava envernizada.** Ver a seção 9.
10. **A cabeça saía deformada.** Ver a seção 8.1 — foi o defeito mais
    grave do marco, e o único encontrado depois do PR aberto.

### 8.1 A cabeça deformada

O defeito mais grave do marco, e o que mais ensinou.

`feature()` **não sabe o que é cabelo**: ele empurra todo vértice
dentro do alcance, e o alcance é três vezes o raio da bolha. O campo
de cachos estava, sem querer, esculpindo o crânio junto.

Medido contra o `rabo` como gabarito (que não chama `feature()`
nenhuma vez), na construção `ultra`:

| | antes | depois |
|---|---|---|
| Vértices de pele da cabeça deslocados | **1 107** | 133 |
| Deslocamento médio | **8,5 mm** | 0,4 mm |
| Pior deslocamento | **35,2 mm** | **1,7 mm** |
| Variação de raio do crânio em `y = 0,78` | **48,5 mm** | **20,3 mm** |
| …o mesmo, no gabarito | 20,3 mm | 20,3 mm |

Duas causas, e a segunda só apareceu depois de corrigir a primeira:

**Altura.** No alto da queda o cabelo encosta na cabeça — em
`t = 0,95` o perfil vale `1,05·R` contra um crânio de até `1,01·R`,
menos de um centímetro de folga. O relevo passou a parar em
`t = 0,74`, e a coroa ficou lisa, que é como cabelo cacheado se
comporta na raiz de todo modo.

**Distância ao crânio, que é o critério certo.** Limitar por altura
não bastava: a seção da queda é uma elipse **rasa na frente**, então
nos azimutes frontais o ponto da elipse cai *dentro* do crânio, não do
lado de fora. Foi assim que uma bolha nasceu em
`x = 0,162 · y = 0,692 · z = 0,009` — a **sete milímetros da orelha**,
com peso gaussiano de 0,96 — e empurrou a lateral da cabeça 28 mm.

A correção final testa cada bolha contra o elipsoide da cabeça
(`1,05·R` de lado, `1,12·R` de altura, `1,15·R` de frente a trás) e
descarta quem estiver a menos de um quarto de raio da casca. A
meia-largura é `1,05·R` e não a do crânio (`0,85·R`) por causa da
**orelha**, que se projeta até `1,03·R` e foi o último vazamento a
cair.

Dois casos de teste novos travam isso: um compara os vértices de pele
um a um contra o gabarito e exige erro abaixo de 2 mm; o outro exige
que a variação de raio do crânio seja **idêntica** à do gabarito em
três alturas. Nada disso custou triângulo: os números de orçamento não
se moveram.

---

## 9. Problemas e limitações

**Defeito preexistente da engine, encontrado de novo aqui.**
`subdivideProfile` **descarta `finish`** e trava o anel na estação mais
próxima. Na prática a perna inteira sai com um acabamento só: a coxa
nua é `Cloth` em **todo mundo** — medido também no `vestido` e no
`praia` do catálogo padrão, que não têm nada a ver com este marco.

Isso apareceu aqui porque a primeira versão pôs o traje inteiro em
`Finish.Glass`, e o defeito espalhou o vidro até sobre a pele. A
correção foi **deixar a base do traje em pano** e pedir vidro peça a
peça, onde ele de fato existe (as lapelas do haori). A Akemi não ficou
com problema nenhum, mas **o defeito do `subdivideProfile` continua
de pé** e pede PR próprio — está fora do escopo deste marco, e
consertá-lo aqui mudaria a geometria de todos os avatares, o que é
exatamente o que este marco se comprometeu a não fazer.

Por consequência, o caso de teste da meia alta mede **cor**, não
`aFinish`: cor é o que de fato se vê. O comentário no teste explica o
motivo, para que ninguém "conserte" o caso trocando a medição por uma
que o defeito faria passar à toa.

**O vão de pele é discreto.** São cerca de 8 cm entre a barra e o cano
da meia. É o que a proporção do corpo permite sem encurtar a saia a
ponto de virar outra coisa.

**Enquadramento das capturas.** `perto()` é multiplicador de
distância, não de aproximação; algumas capturas de diagnóstico saíram
com corte errado antes disso ficar claro. Não afeta o modelo.
