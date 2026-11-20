# Plano — Nexara 2.0

Deusa da Internet e das Redes. Remasterização completa, reconstruída do
zero sobre a `main` em `7ce4e2b`, que já traz a Luma 2.0 e a Suki 2.0.

---

## 1. Por que este documento existe

Porque a Nexara já foi remasterizada uma vez e esse trabalho se perdeu.
O commit `cb02309`, citado como ponto de partida, **não existe mais
neste repositório** — conferido por `git cat-file -t` e por
`git log --all --grep`. Não há o que recuperar, e tentar reconstruir de
memória uma peça perdida é como copiar um quadro de que só se lembra a
moldura.

Então este marco não é um resgate: é uma construção nova, feita com o
que a bancada aprendeu nos marcos da Luma e da Suki-Chan, e escrita
antes de a geometria existir para que o Criador possa discordar da
forma enquanto discordar ainda é barato.

A regra que vale aqui é a mesma dos dois marcos anteriores: **nada do
que é da Nexara pode vazar para o resto do Éden.**

---

## 2. Base

- Ramo da sessão, partindo de `7ce4e2b` (`main` com Luma 2.0 e Suki 2.0
  já mescladas).
- Suki-Chan confirmada integrada antes de qualquer linha nova.
- Nenhuma alteração na `main`; nada entra no mundo sem PR e sem
  autorização expressa.

---

## 3. A referência

A arte oficial mostra, e é isto que a malha tem de dizer:

- cabelo **longuíssimo**, branco na raiz e lavanda nas pontas, com
  movimento de onda — "fluxo de dados", não cabelo parado;
- olhos **ciano luminosos**, expressão serena e tecnológica;
- bodysuit branco de **gola alta**, com peças translúcidas de vidro nos
  ombros;
- **véu holográfico** curto sobre o quadril;
- **dois anéis** luminosos orbitando a cabeça;
- paleta branca, lavanda e ciano — estética Frutiger Aero.

---

## 4. O que não muda

- Luma, Suki-Chan, Amara e Aérion: **nem um vértice**.
- A auréola do Aérion continua **dourada**.
- O guarda-roupa e os penteados sorteados para os habitantes continuam
  exatamente os mesmos.
- Materiais antigos: **nenhum pixel diferente**. O acabamento novo
  nasce com valor zerado em todas as linhas que já existiam.

---

## 5. Peça por peça

### 5.1 Acabamento `Holo` e `FINISH_EMISSIVE`

O Éden tem sete acabamentos (`Skin`, `Cloth`, `Hair`, `Eye`, `Rubber`,
`Shine`, `Glass`), descritos por sete tabelas paralelas lidas pelo mesmo
índice dentro do GLSL. A Nexara precisa de superfícies que **emitem
luz** — anéis e véu holográfico —, e emissão é a única propriedade que
essas tabelas não têm.

Entra um oitavo acabamento, `Holo`, e uma oitava tabela,
`FINISH_EMISSIVE`, com **zero nas sete posições antigas**. Esse zero é
a garantia de não-regressão do marco inteiro: a conta que o shader faz
para todo mundo que não é Nexara continua somando zero.

A emissão sai pelo caminho que o material já tinha
(`emissivemap_fragment`), junto com o preenchimento de personagem que
já existia. **Nenhum passe novo, nenhum material novo.**

### 5.2 Cabelo `fluxo`

Décimo penteado do catálogo, exclusivo dela, fora do sorteio dos
habitantes. Casca contínua sobre a mesma calota que todos os penteados
usam — a calota é compartilhada e não será tocada.

- degradê **de matiz**, não de luminosidade: branco na raiz, lavanda na
  ponta. Clarear não serviria, porque este cabelo já nasce quase branco.
  É para isso que existe `tint`;
- **onda em S** de amplitude pequena, travada enquanto o cabelo ainda
  cobre o crânio;
- comprimento: longo, mas **acima da Cascata**. O cabelo mais longo do
  Éden é o da Suki-Chan, existe um teste que afirma isso, e remasterizar
  uma deusa não é motivo para tomar da outra o que já era dela;
- **relevo de mechas** na face de trás, só a partir de `segments >= 14`.

### 5.3 Anéis orbitais

Dois toros presos ao **osso da cabeça**, dentro da malha única, em
eixos cruzados. Entram por `addGeometry`, como qualquer outra peça:

- **zero chamadas de desenho** a mais — um objeto à parte custaria uma
  por personagem e exigiria reposicionamento a cada quadro;
- a animação sai de graça: o osso da cabeça já balança quando ela anda;
- vêm com o penteado, não com o campo de acessório, que fica livre.

### 5.4 Traje `rede`

Oitavo traje do catálogo, exclusivo dela, fora do sorteio.

- **gola alta**, compartilhando o caminho que o traje `aurora` já abriu;
- **ombreiras de vidro**: placas, não bolas. Ombreira com altura de meio
  raio vira manga bufante;
- **gema ciano** no peito;
- **véu holográfico curto**, do quadril para baixo.

O véu é curto por medida, não por gosto: de `y 0,25` a `y 0,85` as
costas são cabelo e os flancos são braço a partir de `x ≈ 0,10`. A
malha é opaca e de material único, então véu sobre cabelo **apaga o
cabelo**. Véu longo nas costas é impossível neste corpo.

### 5.5 Cor de auréola por ficha

`EdenCharacter` ganha `halo?: number`, lido por `createOfficialAvatar`.
Sem o campo, vale `HALO_DEFAULT` — que é o dourado, e é assim que o
Aérion continua dourado sem declarar nada.

### 5.6 A ficha

```
look('#e8ab82', 'fluxo', '#efe6ff', '#29c8ff', 'rede',
     '#f4f6fb', '#eceaff', '#f4f6fb', 'nenhum', 1.02)
```

`accessory: 'nenhum'` de propósito: o halo dela são os anéis orbitais.

---

## 6. Orçamento

O teto é o avatar antigo inteiro mais 10% no **LOD baixo**, que é onde
o orçamento se decide: é o nível que o `NpcSystem` usa com cinquenta e
quatro pessoas em cena. **7 145 triângulos.**

Medido com `vite-node` sobre a geometria real, nunca estimado:

| nível | padrão | Nexara 2.0 | Suki 2.0 | Luma 2.0 |
|---|---|---|---|---|
| baixa | 6 118 | **6 420** | 6 592 | 7 028 |
| media | 10 694 | 11 632 | 12 320 | 12 404 |
| alta | 17 818 | 19 422 | 20 758 | 20 706 |
| ultra | 62 224 | 69 336 | 74 032 | 73 640 |

Folga de **725 triângulos** no nível que importa. O relevo das mechas e
o vinco da calota existem apenas de `segments >= 14` para cima: no LOD
distante eles não seriam vistos e não são construídos.

---

## 7. Proteção dos ativos compartilhados

- `fluxo` entra em `HAIR_STYLES` e **fora** de `CITIZEN_HAIR_STYLES`.
- `rede` entra em `OUTFITS` e **fora** de `CITIZEN_OUTFITS`.
- `Finish.Holo` é acrescentado ao fim do enum; nada é renumerado.
- `BODY_DETAIL`, `FACE` e `CREATURE_DETAIL` continuam congelados.
- A calota do cabelo, a franja e o rosto são compartilhados e **não
  serão tocados** — qualquer ajuste ali apareceria na Luma e na Suki.

---

## 8. Arquivos a tocar

| arquivo | o quê |
|---|---|
| `src/player/body/BodyRig.ts` | `Finish.Holo` |
| `src/player/body/BodyFinish.ts` | oitava coluna nas tabelas + `FINISH_EMISSIVE` |
| `src/player/Avatar.ts` | emissão no shader, `HALO_DEFAULT`, `setHaloColor` |
| `src/player/AvatarAppearance.ts` | `fluxo` e `rede`, fora das listas de habitantes |
| `src/player/body/BodyBuilder.ts` | `tint`, gola alta, `buildNetSuit`, cabelo `fluxo`, `buildOrbitRings` |
| `src/characters/Pantheon.ts` | ficha da Nexara, campo `halo` |
| `src/characters/CharacterModels.ts` | aplicar a cor de auréola da ficha |
| `lab.html` | opção `nexara` na bancada |

---

## 9. Testes planejados

`tests/unit/nexara-remaster.test.ts`:

1. identidade canônica e paleta da arte oficial;
2. `fluxo` e `rede` fora do sorteio dos habitantes, com mil sorteios;
3. o que já era exclusivo da Luma e da Suki continua protegido;
4. saves antigos continuam válidos;
5. **`FINISH_EMISSIVE` zerado nos sete acabamentos antigos**;
6. todas as tabelas de acabamento com a mesma altura;
7. `Holo` usado pela Nexara e por mais ninguém;
8. auréola do Aérion dourada; cor por ficha funcionando;
9. cabelo longo, mas menor que a Cascata;
10. **nuca coberta**, por traçado de raios;
11. relevo presente nas costas;
12. anéis por cima do crânio, só com o Fluxo, sem draw call extra;
13. gola alta, ombreiras de vidro, véu curto;
14. orçamento do LOD baixo e transição entre os quatro níveis.

---

## 10. Capturas planejadas

Frente, perfil, costas, rosto, caminhando e noite, mais o comparativo
antes/depois. Tudo em `docs/validacao/nexara/`, registrado em
`docs/VALIDACAO-NEXARA-2.0.md`.

---

## 11. Riscos

| risco | como se mede |
|---|---|
| emissão vazar para materiais antigos | teste da coluna zerada |
| nuca descoberta entre calota e queda | traçado de raios, não amostra de vértice |
| véu apagar o cabelo das costas | véu curto, medido antes de construir |
| anéis custarem draw call | contagem de malhas comparada com o padrão |
| estourar o orçamento | `vite-node` sobre a geometria real |
| mexer na Luma ou na Suki sem querer | hash de malha comparado com a `main` |

---

## 12. O que não entra

- Mechas soltas ao lado do rosto — rejeitadas na Luma e na Suki, e pelo
  mesmo motivo: viram palito pendurado.
- Véu longo nas costas — impossível neste corpo, medido.
- Qualquer alteração em outra personagem.
- Qualquer remasterização adicional.

---

## 13. Perguntas ao Criador

1. O comprimento do cabelo parando acima da Cascata está correto, ou a
   Nexara deve passar a ter o cabelo mais longo do Éden?
2. A Nexara deve ganhar também o acessório de auréola, além dos anéis
   orbitais, ou os anéis bastam como halo dela?
