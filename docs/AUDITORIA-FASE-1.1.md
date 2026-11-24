# Auditoria integrada da Fase 1.1 — Criador de Avatares 2.0

Auditoria feita **antes** de qualquer publicação. Nada foi commitado, nenhuma
tag ou PR foi criada e a fase não foi mesclada.

Método da inspeção visual: o sandbox não tem Chromium nem WebGL, então foi
escrito um **rasterizador próprio** (`/.cache/aud/shot.ts`, fora do controle de
versão) que colhe a malha real do avatar — a mesma que o jogo manda para a
GPU —, projeta com z-buffer, luz chave, preenchimento e contraluz, e grava PNG
pelo zlib do Node. As peças foram **olhadas**, não só conferidas por hash. As
folhas estão em `docs/auditoria-1.1/`.

---

## 1. Auditoria de código

| Frente | Veredito |
|---|---|
| Organização Ele/Ela | Correta. `step: Step \| null`; `null` é a tela de escolha, e quem edita entra direto no rosto com o gênero preservado |
| Separação dos catálogos | Real nas três camadas: catálogo (`CREATOR_*_BY_SEX`), seleção (`coerceAppearanceToSex`) e sorteio (`randomAppearance(rng, sex)`) |
| Rosto e seus quatro eixos | Correto. `faceDimsFor` deriva as medidas por ficha; neutro em 1 reproduz a malha antiga vértice a vértice |
| 14 peças novas | Implementadas; **5 defeitos visuais encontrados e corrigidos** (ver item 4) |
| Personagens 2.0 | Íntegro. Dez deusas byte a byte iguais; Aérion ganhou de volta a auréola que já lhe faltava |
| Escopo | Sem invasão: mobilidade, cidades, IA, profissões e diálogo intocados |

**Um achado de código, preexistente:** `Avatar` acendia a auréola só em
`setAppearance`, nunca na construção. Corrigido com uma linha em `rebuild`.

---

## 2. Inspeção visual

Nove folhas em `docs/auditoria-1.1/`: `silhueta`, `cabelos-novos`,
`roupas-novas`, `rosto-eixos`, `niveis-graficos`, `panteao`, `catalogo-ele`,
`catalogo-ela`, `acessorios`.

- **Ele e Ela** — a tela inicial, a silhueta nas quatro vistas, os catálogos
  completos (13 e 20 cabelos, 10 e 10 roupas) e os 7 acessórios foram vistos
  peça por peça. Nenhuma peça deixa de construir, nenhuma fica invisível.
- **Rosto** — os quatro eixos foram renderizados nos extremos da faixa. Todos
  produzem mudança visível e nenhum deforma: olhos crescem, afastam-se,
  sobrancelha sobe, boca alarga.
- **Quatro níveis gráficos** — `ultra`, `alta`, `media` e `baixa` mantêm
  proporção e silhueta; as peças novas sobrevivem até em `baixa`.

---

## 3. Antes e depois

`docs/criador-2.0-antes-depois.svg` (as duas telas) continua válido. A
auditoria acrescenta a comparação **medida** contra a `main` em `dc1386f`:

| | main `dc1386f` | Fase 1.1 | variação |
|---|---|---|---|
| Vértices, avatar médio em `alta` | 10 775 | 10 724 | **−0,5 %** |
| Vértices, cidade de 60 cidadãos | 672 328 | 671 207 | **−0,2 %** |
| Tempo de montagem em `alta` | 41,59 ms | 41,62 ms | +0,1 % |
| Tempo da cidade inteira | 2 439 ms | 2 444 ms | +0,2 % |
| JS gzip | 259,36 kB | 262,46 kB | +3,10 kB |
| CSS gzip | 9,88 kB | 10,36 kB | +0,48 kB |

---

## 4. Estado dos 14 modelos novos

A inspeção reprovou cinco peças e aprovou nove na primeira passada. As cinco
foram corrigidas e reinspecionadas:

| Peça | O que a imagem mostrou | Correção |
|---|---|---|
| `pixie` | Mancha preta chapada na nuca: a bola de cabelo, colada a 0,96 R, recebia oclusão por todos os lados | Virou relevo na própria casca |
| `trancinhas` | **Duas tentativas erradas**: em arco esférico as contas afundavam no crânio; soltas atrás, boiavam entre cabeça e ombro | Cada fio virou um loft contínuo, encostado, com cores alternadas |
| `moicano` | Tufo pairando acima da calota, não crista | Arco que nasce dentro da casca e sobe acima dela |
| `meiopreso` | Queda retangular, lia como placa pendurada | Ponta afinada |
| `repicado` | Quase idêntico ao `curto` | Degraus maiores, visíveis na silhueta |
| `macacao` | **Indistinguível do Traje Aero** — mesma silhueta, só uma costura a mais | Virou jardineira: peitilho e alças na cor de baixo |
| `maio` | Pelve saía na cor de baixo: lia como calcinha sobre o maiô | Peça inteira, como o vestido |

As outras sete (`rabolateral`, `coques`, `ondas`, `franjao`, `saia`, `tunica`,
`jaqueta`) passaram sem reparo.

---

## 5. Panteão e Aérion

Prova por comparação direta com a `main`, usando um worktree de `dc1386f` e o
mesmo script de hash (posições, cores e visibilidade de cada malha):

```
haru nexara suki luma lilly akemi saturno maze jupiter amara → IDÊNTICAS
aerion → única diferença: halo.visible  false → true
```

As dez deusas não tiveram **um vértice** alterado. No Aérion, a geometria
também é idêntica; o que mudou foi a auréola, que a ficha dele sempre pediu e
que o construtor nunca acendia.

Nenhuma peça exclusiva aparece em catálogo comum, e 400 cidadãos sorteados não
produziram uma única peça do Panteão.

---

## 6. Testes

| Bateria | Resultado |
|---|---|
| TypeScript | `tsc --noEmit` exit 0 |
| Build de produção | 596 ms, sem aviso novo |
| Regressão completa | **405 suítes · 1 600 testes · 1 588 ok · 11 pulados · 1 falha** |
| Isolamento | 7 suítes rodadas sozinhas: 160/160 |
| Mutação | **6 mutantes, 6 mortos** |
| Combinações | 330 pares cabelo×roupa construídos; 1 600 sorteios sem vazamento |

A única falha é `coracao-roseiral.test.ts`, timeout preexistente, acompanhado
em separado e sem relação com o criador.

**Mutantes e quem os pegou:**

| Mutante | Pego por |
|---|---|
| M1 catálogo do criador volta a ser o acervo inteiro | 8 testes |
| M2 Aleatório volta a fixar o sexo feminino | 4 testes |
| M3 troca de sexo não conserta a peça (separação só visual) | 3 testes |
| M4 silhueta morta: todo corpo volta ao de referência | 6 testes |
| M5 auréola apagada na construção | 3 testes |
| M6 rosto inerte: os quatro eixos deixam de medir | não compila + 23 testes |

Um caso novo precisou de ajuste de amostra: construir 120 cidadãos completos
estourava os 5 s de limite sob carga paralela. Passou a 40 construções, com a
varredura larga (400 fichas) no caso vizinho, que não monta malha.

---

## 7. Desempenho e compatibilidade

- Avatar **0,5 % mais leve** em `alta`; cidade 0,2 % mais leve. As peças novas
  são combinações de corte, não geometria empilhada.
- `SAVE_VERSION` continua em **3**. Save v1 sem `sex` e sem rosto abre
  preservando nome, dia, altura e peças; os campos novos entram no neutro.
- Ida e volta pelo `SaveSystem` real (localStorage) devolve a ficha idêntica,
  inclusive sexo, auréola e os quatro eixos.
- Dez idas e voltas pelo saneamento não produzem deriva.
- Peça de deusa já gravada numa ficha antiga não é derrubada.

---

## 8. Riscos restantes

1. **A túnica, no corpo masculino, lê como vestido longo.** É escolha de
   identidade, não defeito: ela está marcada `ambos` e isso é o que deixa os
   dois catálogos com dez roupas. Trocá-la para `fem` deixaria Ele com nove.
   **Decisão sua** — a imagem está em `docs/auditoria-1.1/catalogo-ele.png`.
2. ~~A `tranca` tem contas soltas umas das outras.~~ **Resolvido** — ver a
   seção 9. A peça era um colar de contas que nunca se encostavam; agora é um
   fio contínuo, com os nós preservados.
3. **`coracao-roseiral.test.ts`** segue intermitente por timeout, preexistente.
4. **O `moletom` e o `aero` continuam parecidos** entre si (ambos manga e
   perna compridas). Preexistente; o `macacao` novo já foi separado dos dois.
5. **Acessórios não têm eixo de sexo** — não existe `ACCESSORY_AUDIENCE` no
   jogo, e criá-lo seria inventar categoria sem suporte.
6. **A conferência no navegador continua sendo sua.** O rasterizador prova
   geometria, encaixe e proporção, mas não reproduz shader, emissão nem
   iridescência — o Aérion, por exemplo, aparece quase preto nas folhas porque
   o acabamento cósmico não é simulado.

---

## 9. Acabamento: a trança

A inspeção da seção 2 marcou a `tranca` como suspeita. A medição confirmou, e a
peça foi corrigida nesta rodada — é a única mudança de código feita depois do
relatório original.

### O que estava errado

A peça era feita de bolas enfileiradas, e **nenhuma encostava na vizinha**. Com
`headR` em 0,176:

| nível | nós | passo entre centros | soma dos raios vizinhos | vão |
|---|---|---|---|---|
| ultra | 7 | 0,0607 | 0,0491 | **+24 %** |
| alta | 7 | 0,0607 | 0,0491 | **+24 %** |
| media | 7 | 0,0607 | 0,0491 | **+24 %** |
| baixa | 5 | 0,0867 | 0,0482 | **+80 %** |

A causa raiz é de projeto, não de número mal escolhido: o raio vertical do nó
era a constante `R·0,145·s`, enquanto o passo entre nós **depende da contagem**,
que cai de sete para cinco em `baixa`. Constante contra variável — o vão tinha
de abrir.

Medido de outro jeito, varrendo 401 planos horizontais ao longo da queda e
contando quantos triângulos cada plano atravessa:

| nível | planos vazios antes | planos vazios agora |
|---|---|---|
| ultra | 57 / 401 | **0** |
| alta | 80 / 401 | **0** |
| media | 109 / 401 | **0** |
| baixa | **159 / 401** (40 % da peça era ar) | **0** |

### A correção

Duas partes, e **não** é a mesma solução das `trancinhas`. Lá o fio é fino e
liso, e um loft sozinho resolve. Aqui o traço da peça **é** o nó alternado:
trocá-lo por um loft liso apagaria a identidade dela.

1. **Miolo contínuo** — um loft de três estações que atravessa os nós de ponta
   a ponta e nasce **dentro** da calota (`z = −R·0,94`), de onde a trança
   deveria sair desde sempre. Sozinho, já garante que não exista buraco.
2. **Raio do nó derivado do passo** — `ry = max(R·0,145·s, passo·0,62)`, no
   lugar da constante. A sobreposição passa a valer em qualquer contagem de
   nós, inclusive nos cinco de `baixa`.

Preservados sem tocar: alternância de lado (`±R·0,07·s`), largura (`R·0,2·s`),
profundidade (`R·0,19·s`), cores alternadas, e o laço escuro da ponta.

### Custo

O miolo acrescenta malha, e o anel dele foi afinado a 0,22 do anel do penteado
justamente para a peça não passar o teto do acervo:

| nível | antes | agora | variação | teto (`cacheado`) |
|---|---|---|---|---|
| ultra | 34 988 | 35 160 | +172 (+0,5 %) | 35 176 ✓ |
| alta | 10 777 | 10 845 | +68 (+0,6 %) | 11 153 ✓ |
| media | 6 625 | 6 681 | +56 (+0,8 %) | 7 141 ✓ |
| baixa | 3 949 | 3 993 | +44 (+1,1 %) | 4 213 ✓ |

No empacotado, +0,10 kB gzip.

### Testemunha

`tests/unit/tranca-continua.test.ts`, 7 casos, é a prova de que a correção não
se desfaz sozinha: varre os planos em cada um dos quatro níveis, exige corpo da
nuca à ponta, exige que a largura **continue oscilando** (se alguém trocar os
nós por um tubo liso, o caso cai) e trava o custo abaixo do `cacheado`.

Rodada contra `dc1386f`, a testemunha **falha nos quatro casos de
continuidade** e passa nos outros três — é defeito que ela pega, não
formalidade.

Imagens: `docs/auditoria-1.1/tranca-antes.png` e
`docs/auditoria-1.1/tranca-corrigida.png` (quatro vistas, dois detalhes e os
quatro níveis em perfil e costas). O catálogo `catalogo-ela.png` foi regravado.
