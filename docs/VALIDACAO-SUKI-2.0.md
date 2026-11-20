# Validação — Suki-Chan 2.0

Remasterização visual da Deusa da Inteligência e da Educação, sobre a
`main` que já recebeu a Luma 2.0.

Plano aprovado: [`PLANO-SUKI-2.0.md`](PLANO-SUKI-2.0.md).

---

## 1. O que entrou

| peça | o que é |
|---|---|
| cabelo **Cascata** | queda preta até a altura do quadril, afunilando, com sulcos de mecha escavados na própria massa |
| **diadema** | tiara de ouro com pontas e duas gemas de vidro, dentro do penteado |
| **Vestido Docente** | vestido longo magenta, manga três-quartos, faixa na cintura |
| **decote em V** | painel de pele em leque, com as duas bordas em magenta claro |
| **lentes vazadas** | óculos dela, com a lente opaca trocada por um anel de vidro |

A ficha passou a ser:

```ts
look('#e8ab82', 'cascata', '#1a1a22', '#3b2a20', 'docente',
     '#e23c8f', '#b02a73', '#f4f6fb', 'lentes', 0.97)
```

Cânone intocado: `id`, `name`, `title`, `domain`, `colors`, `tagline`,
`bio`, `place` (Estufa Celeste), `aura`, `contact`, persona, voz,
missões e diário. Ela continua a professora de biologia; trocou de
roupa, não de pessoa.

## 2. Decisões do Criador que moldaram a peça

1. **O diadema mora no cabelo.** A ficha tem um campo de acessório só,
   e o dela está ocupado pelos óculos — que são metade da leitura da
   personagem. O diadema entrou dentro do penteado, como os anéis
   orbitais da Nexara. Consequência assumida: quem escolher a Cascata
   leva a coroa junto, e é por isso que a Cascata sai do sorteio dos
   habitantes.
2. **O vestido é longo.** Barra em `GOWN_HEM_Y` (−0,46), a mesma do
   Manto Aurora — abaixo dela a saia deixa de abrir como cone e vira
   coluna.
3. **A lente de vidro é só dela.** O acessório `oculos` compartilhado
   **não foi tocado**: habitantes e outros personagens continuam com
   a lente de sempre. A versão vazada é um acessório novo, `lentes`,
   fora do sorteio.

## 3. Orçamento

Medido com `npx vite-node`, nos quatro níveis:

| nível | avatar padrão | Suki 2.0 | malhas |
|---|---|---|---|
| **baixa** | 6 118 t | **6 592 t** | 3 ↔ 3 |
| media | 10 694 t | 12 320 t | 3 ↔ 3 |
| alta | 17 818 t | 20 758 t | 3 ↔ 3 |
| ultra | 62 224 t | 74 032 t | 3 ↔ 3 |

**Teto do nível baixo: 7 145,6 t** — o avatar antigo inteiro mais 10%,
o contrato herdado da Luma. A Suki fecha com **553,6 de folga**.

Ela é **mais barata que a Suki anterior** (6 722 t), apesar de ganhar
diadema, decote e um cabelo três vezes mais longo. Duas coisas pagaram
a conta: o coque custava dois sólidos, e a lente opaca custava 160
triângulos por olho — as duas bolas saíram.

Contagem de malhas idêntica ao avatar padrão nos quatro níveis: **o
remaster não acrescenta uma única chamada de desenho.**

## 4. Capturas

Todas em `docs/validacao/suki/`, WebGL 2.0 real pela bancada, todas com
`ERROS: nenhum`.

| arquivo | o que mostra |
|---|---|
| `antes-corpo.png` / `antes-rosto.png` | a Suki anterior: coque, casual, lente opaca |
| `depois-corpo.png` | de frente, corpo inteiro |
| `depois-rosto.png` | de perto: diadema, gemas, lentes vazadas |
| `depois-costas.png` | a queda inteira e os sulcos |
| `depois-perfil.png` | o cabelo deitado nas costas |
| `depois-andando.png` | a saia e o cabelo em movimento |
| `depois-noite.png` | sob a luz das 22 h |
| `regressao-habitantes.png` | cinco habitantes do elenco, **sem** diadema, vestido ou lente de vidro |

## 5. Os defeitos que a bancada pegou

Nenhuma destas correções veio de leitura de código; todas vieram de
olhar para a imagem.

1. **Barbatana.** A queda saía como quilha atrás da nuca, com 1,0·R de
   profundidade constante. De perfil era uma aleta. A seção ficou
   rasa.
2. **Nuca careca.** Ao afinar a seção, a queda ficou mais rasa que a
   calota e apareceu um crescente de occipital **no meio do cabelo**.
   A profundidade passou a entrar casando com a calota e só afinar
   depois das omoplatas. Há um teste que mede isso por faixa de
   altura.
3. **Urna.** Largura constante do alto às omoplatas desenhava um
   cilindro, e cilindro com fundo abaulado é um vaso. O afunilamento
   virou contínuo, sem patamar.
4. **Sulcos que não pousavam.** Escavar não adianta com o centro da
   escavação dentro da massa. O perfil virou função nomeada, e os
   sulcos leem a mesma função para saber onde a superfície está.
5. **Rabo cinzento.** Clarear 30% em direção à ponta tirou o preto do
   cabelo. Ficou em 13%.
6. **Mechas-palito.** Duas mechas soltas à frente do ombro leram como
   palitos pendurados — o mesmo erro já cometido no cabelo da Luma.
   Removidas.
7. **Buraco de fechadura, depois medalhão, depois laço.** O decote
   passou por três versões erradas antes de acertar. Decote em V
   começa **no ombro**: estreito, vira objeto pregado no peito.
8. **Painel enterrado.** O peito leva um realce em `y = 0,285` que o
   empurra à frente da elipse do perfil. O painel calculado pelo papel
   nascia 6 mm atrás da superfície e aparecia só como duas listras. A
   frente do peito passou a ser **medida** na malha: 0,0909 no alto,
   0,1112 na ponta.
9. **Óculos de natação.** O anel de vidro grosso engordava o olho que
   deveria deixar passar. Afinou de 13 para 4,5 mm e encostou no aro.

## 6. Testes

`tests/unit/suki-remaster.test.ts` — **19 casos, todos verdes**:

- identidade canônica e leitura da arte oficial;
- Cascata, Vestido Docente e lentes fora do sorteio de habitantes, com
  400 sorteios cada, e o Manto Aurora da Luma ainda protegido junto;
- saves antigos (`coque` + `casual` + `oculos`) continuam montando;
- vestido mais longo que a saia curta; manga três-quartos com pano no
  braço e pele no antebraço; decote com mais pele no peito que o
  vestido fechado;
- Cascata é o cabelo mais longo do Éden; não sobra occipital entre a
  calota e a queda; o diadema existe e não atravessa o crânio, medido
  **por raio dentro de faixas de altura**;
- lentes de vidro só nela, e mais baratas que os óculos opacos;
- orçamento do nível baixo dentro do teto;
- paridade de malhas com o avatar padrão nos quatro níveis.

Uma armadilha de medição vale registro: a primeira versão do teste de
comprimento filtrava vértices **escuros**, e o degradê da Cascata
clareia a ponta de propósito — o filtro descartava justamente o
trecho a medir, e o cabelo mais longo do Éden aparecia como o mais
curto. A medida passou a ser pelo acabamento `Finish.Hair`.

## 7. Portão

| etapa | resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npx vitest run` | **1 107 passando**, 11 pulados, 1 falhando |
| `npm run build` | 616 ms |

A única falha é `coracao-roseiral.test.ts` — "nenhum habitante nasce
dentro, nem vai parar lá em dois minutos de parque", `Test timed out in
5000ms`. Ela é **pré-existente** e não tem relação com este marco: foi
reproduzida idêntica na base limpa, com todas as mudanças guardadas
(`git stash`), falhando do mesmo jeito e no mesmo teste.

## 8. O que não entra

Nada da Nexara. A remasterização dela foi perdida junto com a da Suki
e será reconstruída depois, em PR próprio: sem `Finish.Holo`, sem
`fluxo`, sem `rede`, sem `buildAneis`, sem halo por ficha.

A sequência do Éden Aero continua: **Luma 2.0 → Suki 2.0 → Nexara
2.0.**

**O merge depende de autorização expressa do Criador.**
