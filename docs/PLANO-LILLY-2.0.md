# Plano — Lilly 2.0

Deusa da Música e da Vibração. Remasterização sobre a `main` em
`accc2fa`, que já traz Luma 2.0, Suki-Chan 2.0 e Nexara 2.0.

---

## 1. Base inspecionada

Antes de uma linha de código:

- `main` em `accc2fa`, **Nexara 2.0 confirmada integrada** (`fluxo` e
  `rede` presentes na ficha, `Finish.Holo` no enum).
- **Lilly já existe** em `Pantheon.ts:696` — não é personagem nova:

```
look('#cf8f63', 'rabo', '#7fd6ff', '#7a5cc9', 'esportivo',
     '#1b82ea', '#2e3a4f', '#29c8ff', 'fones', 1.0)
aura: 0x8fd6ff   colors: ['#8fd6ff', '#5a3fe0']
```

Cabelo ciano claro preso em rabo, olhos violeta, traje esportivo azul,
**fones de ouvido** e aura azul-clara. Fica no Palco Aurora.

### O que a inspeção mudou no plano

**Não existe análise de frequência.** `src/systems/AudioSystem.ts` é
síntese procedural — osciladores, filtros, camas de ruído — com
`setMusicActive(boolean)` e nenhum `AnalyserNode`. Sincronizar os
elementos de Lilly com a música exigiria **criar** essa API, e a ordem
foi não inventar API inexistente. Então a vibração dela é **forma
congelada na malha**: um equalizador esculpido, não um equalizador que
reage. Se o Criador quiser reação real ao áudio, isso é um marco à
parte — abrir o analisador é mexer num sistema compartilhado.

**Os fones são acessório compartilhado.** `'fones'` está em
`CITIZEN_ACCESSORIES`: remasterizar o acessório global mudaria todo
cidadão que usa fone na praça. Por isso os fones dela nascem como peça
exclusiva da identidade sonora, e o `'fones'` genérico fica intocado.

---

## 2. Decisões do Criador

| questão | decisão |
|---|---|
| paleta (a arte e o texto divergiam) | **a arte manda**: escuro + neon verde-ciano, acentos magenta |
| fones | **remasterizados em vidro e luz**, como peça dela |

Os **olhos continuam lilás/violeta**: o texto pediu isso de forma
explícita e é o que a ficha canônica já tem (`#7a5cc9`). O conflito de
paleta que levei ao Criador era de cabelo e traje, não de olhos.

---

## 3. Identidade visual

### 3.1 Cabelo `onda`

Décimo primeiro penteado do catálogo, exclusivo dela, fora do sorteio.

- longo, volumoso e fluido, com **movimento de onda sonora**: a
  largura da queda oscila em ciclos ao descer, como a envoltória de
  uma forma de onda — não é ondulação decorativa, é a silhueta
  dizendo "som";
- **base escura** (quase preta, azulada) com **mechas neon** que
  acendem: verde-limão perto do rosto, virando turquesa no
  comprimento. O degradê é de matiz, por `tint`, como o da Nexara;
- as mechas acesas usam `Finish.Holo` — é o único acabamento com
  emissão, e é o que faz o neon existir à noite;
- silhueta reconhecível de frente, perfil e costas.

A calota, a franja e o rosto são **compartilhados e não serão
tocados**: qualquer ajuste ali apareceria na Luma, na Suki e na Nexara.

### 3.2 Traje `sonora`

Nono traje do catálogo, exclusivo dela, fora do sorteio.

- jaqueta curta escura de gola, com **costuras luminosas** correndo
  pelas bordas — as linhas de luz da arte;
- **saia longa translúcida**, em camadas, que é o "fluido" do pedido;
- **vidro e cristal** nos ombros e no cinto;
- acentos em ciano e magenta, distribuídos sem excesso.

### 3.3 Os elementos musicais

Duas peças, e nenhuma delas é um anel liso — a Nexara já tem anéis, e
repetir o mesmo recurso em outra deusa apaga as duas.

**Equalizador radial.** Uma coroa de barras verticais de alturas
diferentes em volta do quadril, seguindo uma forma de onda. É a imagem
mais direta de "música" que existe, e aqui ela é geometria: barras
presas ao osso do quadril, dentro da malha única. As alturas seguem
uma senoide amostrada, de modo que a coroa lê como um espectro
congelado em vez de uma cerca.

**Fones de frequência.** Os fones remasterizados: arco de vidro e
conchas com uma fresta acesa, em `Holo`. Vêm com o penteado `onda`,
pelo mesmo motivo que o diadema da Suki mora na Cascata — a peça é da
personagem, não do campo de acessório.

Ambos entram por `addGeometry` no osso correspondente: **zero chamadas
de desenho a mais**, e acompanham a animação sem uma linha de código
novo.

### 3.4 A ficha

```
look('#cf8f63', 'onda', '#161b2a', '#b98cff', 'sonora',
     '#171a26', '#121520', '#29c8ff', 'nenhum', 1.0)
```

Pele preservada. `accessory: 'nenhum'` porque os fones vêm com o
penteado. Aura e `colors` da ficha serão revistas para o neon.

---

## 4. Materiais

**Nenhum acabamento novo.** `Finish.Holo` já existe, já emite e já é
lido pelo shader — foi aberto no marco da Nexara exatamente para isto.
Lilly usa `Holo` nas mechas, nas costuras, no equalizador e nos fones;
`Glass` no cristal; `Cloth` no tecido.

Nenhum passe novo, nenhum shader novo, nenhum material novo.

---

## 5. Orçamento

Teto de **7 145 triângulos** no LOD baixo, que é onde o orçamento se
decide — é o nível que o `NpcSystem` usa com dezenas de pessoas em
cena. O avatar padrão custa 6 118, o que dá **1 027 de folga**.

Regras de gasto:

- o equalizador radial só existe de `segments >= 14` para cima — é
  detalhe que ninguém enxerga a trinta metros;
- as barras são caixas de poucos triângulos, não cilindros;
- as mechas neon são **cor e acabamento** sobre a malha do cabelo, não
  geometria extra;
- medição com `vite-node` sobre a geometria real, nunca estimativa.

---

## 6. Isolamento

- `onda` em `HAIR_STYLES`, **fora** de `CITIZEN_HAIR_STYLES`.
- `sonora` em `OUTFITS`, **fora** de `CITIZEN_OUTFITS`.
- `'fones'` genérico **não é tocado**.
- Nada é renumerado em `Finish`, `BODY_DETAIL` ou `FACE`.
- Prova por **hash da malha construída** nos quatro LODs, comparando a
  árvore da `main` em `git worktree` com a desta branch: Luma, Suki,
  Nexara, Aérion, Amara e o avatar padrão têm de sair idênticos.

Essa prova não é cerimônia: foi ela que pegou, no marco da Nexara, um
alongamento de cabelo aplicado por engano no penteado da **Luma**.

---

## 7. Arquivos a tocar

| arquivo | o quê |
|---|---|
| `src/player/AvatarAppearance.ts` | `onda` e `sonora`, fora das listas de habitantes |
| `src/player/body/BodyBuilder.ts` | cabelo `onda`, traje `sonora`, equalizador, fones |
| `src/characters/Pantheon.ts` | ficha de Lilly |
| `lab.html` | opção `lilly` na bancada |
| `tests/unit/lilly-remaster.test.ts` | suíte do marco |
| `docs/VALIDACAO-LILLY-2.0.md` | validação |
| `docs/validacao/lilly/` | capturas |

`BodyRig.ts`, `BodyFinish.ts` e `Avatar.ts` **não precisam mudar** —
a infraestrutura de emissão que a Nexara abriu já serve.

---

## 8. Testes planejados

1. identidade canônica e paleta decidida;
2. `onda` e `sonora` fora do sorteio, com mil sorteios de habitante;
3. o que já era exclusivo de Luma, Suki e Nexara continua protegido;
4. o acessório `fones` genérico **não mudou**;
5. saves antigos continuam válidos;
6. mechas neon presentes e emissivas;
7. equalizador presente, com barras de alturas diferentes;
8. fones vêm com o penteado e não com o acessório;
9. nuca coberta, por traçado de raios;
10. orçamento do LOD baixo, paridade de draw calls, transição de LOD.

---

## 9. Capturas

Antes e depois, frente, perfil, costas, rosto, movimento, dia e noite.
Em `docs/validacao/lilly/`, registradas em
`docs/VALIDACAO-LILLY-2.0.md`.

---

## 10. Riscos

| risco | como se mede |
|---|---|
| mexer em outra deusa sem querer | hash de malha contra a `main` |
| mudar o fone dos habitantes | teste do acessório genérico |
| equalizador parecer cerca | alturas por senoide, conferidas na bancada |
| cabelo escuro esconder o relevo | o escuro perdoa emenda, mas não perdoa silhueta: perfil e costas julgam |
| estourar o orçamento | `vite-node` sobre a geometria real |

---

## 11. O que não entra

- Reação real ao áudio — não há `AnalyserNode`; é marco à parte.
- Mechas soltas ao lado do rosto — rejeitadas em três marcos seguidos.
- Qualquer alteração em outra personagem.
- Qualquer remasterização adicional.
