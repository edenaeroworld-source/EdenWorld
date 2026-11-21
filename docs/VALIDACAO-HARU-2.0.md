# Haru 2.0 — Remasterização Oficial · relatório de validação

**Branch:** `arena/4e0d78d0-edenworld` (a partir de `9d96910`, a `main` depois do marco da Saturno)
**PR:** Haru 2.0 — Remasterização Oficial
**Personagem:** Haru — Deusa da Tecnologia e dos Sistemas, dona do EdenOS, primeira deusa autista do Panteão

---

## 1. O que a investigação encontrou antes de uma linha ser escrita

Quatro achados mudaram o desenho inteiro, e nenhum deles estava no
briefing.

### 1.1 Os três campos de aparência dela eram compartilhados

| campo | valor antigo | quem mais usa |
|---|---|---|
| `hairStyle` | `curto` | **habitantes sorteados** |
| `outfit` | `aero` | **Aérion (o Criador), Amara**, habitantes |
| `accessory` | `oculos` | **habitantes sorteados** |

O pior é o traje. Remasterizar o `aero` onde ele mora teria repintado
**o Criador do Éden Aero** junto com ela. A prova está medida: o
Aérion e a Amara produzem contagens de triângulos **idênticas** nos
quatro níveis de qualidade (6 288 / 11 016 / 18 398 / 64 292), porque
é a mesma construção.

**Decisão:** penteado novo (`fibra`) e traje novo (`sistema`), ambos
fora do sorteio de habitantes. `aero`, `curto` e `oculos` saem do
marco intocados.

### 1.2 Ela estava pintada com a cor padrão do motor

`topColor` era `#29c8ff` — exatamente o destaque genérico que o motor
aplica a qualquer avatar. A Deusa da Tecnologia vestia a cor que o
sistema usa quando não há ficha.

### 1.3 A bio prometia quatro coisas e a malha entregava uma

A bio falava em prata, circuitos acesos e visor. Nada disso existia na
geometria. Este marco inverte: a malha passou a cumprir a bio.

A exceção é o cabelo. A característica oficial dizia *"chanel
assimétrico"*, e a arte de referência enviada no mesmo pedido mostrava
cabelo **muito longo**. Perguntado, o Criador escolheu a arte — e a
frase da bio foi corrigida junto, porque deixar o texto prometendo
chanel enquanto a malha entrega outra coisa é repetir o defeito que
este marco veio consertar.

### 1.4 A Nexara já é a Deusa da Internet, e já foi remasterizada

|  | Haru | Nexara |
|---|---|---|
| título | Deusa da **Tecnologia e dos Sistemas** | Deusa da **Internet e das Redes Sociais** |
| eixo | **infraestrutura** — o cano | **tráfego** — o que passa dentro |
| paleta | `#8fe6ff` · `#1b82ea` (ciano) | `#d6b8ff` · `#7a3fe0` (lilás) |
| penteado | `fibra` | `fluxo` |
| silhueta | queda longa, **sem anel orbital** | **anéis orbitais** |
| remasterizada | **este marco** | marco anterior |

**A divisão adotada:** o anel orbital é a silhueta da Nexara a trinta
metros e continua só dela. A Haru é grafite com luz embutida; a Nexara
é clara. O teste `a Haru não usa anel orbital` guarda isso: nenhum
vértice dela passa de `0,3` de raio no plano horizontal.

---

## 2. As decisões que o Criador tomou

Perguntado antes da implementação, por `ask_user`:

| pergunta | resposta |
|---|---|
| cabelo: característica oficial (chanel) ou arte (longo)? | **longo**, como a arte |
| identidade autista: peça funcional, símbolo ∞, ou os dois? | **os dois** |
| óculos | **remover**, trocar por visor/HUD do EdenOS |
| cores da ficha (`topColor`/`bottomColor`) | **pode ajustar** |

A **peça de quebra-cabeça está proibida** e não entrou: boa parte da
comunidade autista a rejeita por associação histórica a campanhas de
"cura". O símbolo é o **infinito**, que é o endossado pela comunidade,
e ele é a única peça do marco que **não corta por distância** — é
marca de identidade, não ornamento, pela mesma regra da pata da
Saturno.

A peça funcional digna é um par de **abafadores de ruído** de verdade:
concha, anel prateado, LED de estado e arco ligando as duas por cima.

---

## 3. A ficha, antes e depois

| campo | antes | depois |
|---|---|---|
| `skin` | `#f6c9a4` | `#f6c9a4` *(igual)* |
| `hairStyle` | `curto` | **`fibra`** |
| `hairColor` | `#7fd6ff` | `#7fd6ff` *(igual)* |
| `eyeColor` | `#2f6fb3` | `#2f6fb3` *(igual)* |
| `outfit` | `aero` | **`sistema`** |
| `topColor` | `#29c8ff` *(padrão do motor)* | **`#36476b`** |
| `bottomColor` | `#2e3a4f` | **`#1d2740`** |
| `shoeColor` | `#f4f6fb` | `#f4f6fb` *(igual)* |
| `accessory` | `oculos` | **`nenhum`** |
| `height` | `0.99` | `0.99` *(igual)* |

Preservados sem toque: `aura 0x7fd6ff`, `colors ['#8fe6ff','#1b82ea']`,
título, domínio, `place`, `@haru`, `journal.id`, os nós de diálogo
(`primeira`, `edenos`, `bluebloom`, `sobre`) e a bandeira
`conheceu-haru`.

`accessory: 'nenhum'` é deliberado: abafadores e visor nascem **dentro
do penteado**, porque `accessory` é um campo só e `oculos`, `fones` e
`chapeu` são todos herdados por habitantes sorteados.

---

## 4. Orçamento

Teto do LOD baixo: **7 145,6** triângulos.

| | antes | depois |
|---|---|---|
| baixa | 6 642 | **5 960** |
| média | 11 290 | 12 214 |
| alta | 18 534 | 19 906 |
| ultra | 63 396 | 66 588 |

Ela saiu de meio do pelotão para **a mais leve de todo o elenco** no
LOD baixo — abaixo até do corpo padrão (6 118):

```
haru 5960 · padrao 6118 · saturno 6244 · aerion 6288 · amara 6288
nexara 6420 · suki 6592 · akemi 6648 · lilly 6768 · jupiter 6902
maze 7024 · luma 7028
```

A conta fecha porque o acessório `oculos` custava **524 triângulos e
não cortava por distância** — aparecia inteiro a cinquenta metros. O
desenho novo é todo escalonado:

| nível | o que existe |
|---|---|
| **baixa** (10) | calota, queda longa, traje, **emblema ∞** |
| **média** (14) | + franja, mecha assimétrica, abafadores, visor, circuitos |
| **alta** (20) | + filamentos de relevo, fitas de luz da queda, linhas do visor |
| **ultra** (44) | tudo, em resolução cheia |

Chamadas de desenho: **3 malhas**, como todas as outras deusas. Nenhuma
peça nova paga chamada própria.

---

## 5. As cinco rodadas de bancada, e o que cada uma consertou

Nenhum destes defeitos aparece lendo código. Todos vieram de olhar a
captura.

| # | o que a bancada mostrou | conserto |
|---|---|---|
| 1 | o emblema e os traços de circuito juntos no peito leram como **uma carinha** — os dois aros viraram olhos, o traço horizontal virou boca | ∞ subiu para a clavícula; a trilha passou a correr **de um lado só** |
| 1 | uma placa prateada atravessava o peito de ombro a ombro: **babador** | removida; sobraram as ombreiras |
| 1 | o cabelo lia como **capacete com dois canos** ao lado do rosto | perfil da queda refeito |
| 1 | a peça da têmpora **flutuava** | encolhida e encostada |
| 2 | a queda era uma **prancha azul lisa** — o relevo de `feature()` não sobrevive a esta escala | fitas de luz em geometria |
| 3 | a queda afunilava de `0,94R` a `0,41R`: **capa de chuva** | perfil quase reto, afinando só no último quinto |
| 4 | o arco dos abafadores atravessava o rosto acima dos olhos como uma **monocelha** | estava girado 90° em Y, no plano da nuca e da testa; meia volta no plano das **duas orelhas** |
| 4 | **nuca nua** entre a calota e o cabelo | a queda nascia com `0,92R`, menos que o crânio; subiu para `1,06R` |
| 4 | cabeça como **touca de natação** — a franja da calota base é só relevo | franja em geometria |
| 5 | a franja em geometria virou uma fileira de **dedos** apontando para o rosto | lâminas largas e sobrepostas, não tubos espaçados |
| 5 | as lâminas nasceram **dentro da calota** e sumiram | mediam o raio do crânio; a casca de cabelo é mais bojuda — passaram a assentar na elipse da calota |
| 6 | o visor cobria a **sobrancelha** em vez da vista | desceu para `cy + 0,12R`, que é onde `FACE.eyeY` põe o olho |

---

## 6. O acidente que a validação pegou

Na rodada 2, uma correção de `rz: R * 0,34 → R * 0,2` foi aplicada ao
`case` errado: caiu no **`cachos` da Akemi**, cujo marco já está
fechado e mesclado.

Nada o teria revelado. A ficha da Akemi não mudou, a contagem de
vértices não mudou (13 822), a contagem de triângulos não mudou
(22 286) e a suíte inteira continuava verde — só as **posições** de
alguns vértices tinham se deslocado.

Quem pegou foi a comparação de assinaturas de malha contra a `main`:
84 avatares construídos nos dois lados, e **8** divergiram quando só 4
deviam. A bisseção por arquivo apontou o `BodyBuilder.ts`, e a leitura
do hunk mostrou o comentário *"é luz batendo em cacho"* onde deveria
estar o da fibra óptica.

Revertido. A Akemi voltou ao hash original, e a §7.4 mostra
`cabelo/cachos` e `panteao/akemi` idênticos à `main` na varredura
final.

**Conclusão de processo, em duas partes.** A primeira: substituição
por texto em arquivo de 3 600 linhas precisa de âncora que inclua o
comentário vizinho, não só a linha de código — foi a semelhança entre
dois blocos de queda de cabelo que deixou a correção cair no `case`
errado.

A segunda deu origem a `tools/assinaturas.ts`, que ficou no
repositório. A conta improvisada que pegou este acidente olhava só
`position` da malha do corpo, e isso é sorte: uma peça **repintada**
sem sair do lugar teria passado. A ferramenta agora cobre todos os
atributos de geometria, as três malhas do avatar e o catálogo inteiro
peça a peça, e serve o marco da Maze e o da Júpiter sem reescrita.

---

## 7. Validação

### 7.1 Tipos

`npx tsc --noEmit` — **limpo**.

### 7.2 Testes

`tests/unit/haru-remaster.test.ts` — **35 casos, todos passam**:

| grupo | casos |
|---|---|
| o que é exclusivo dela | 4 — catálogos, 2 000 sorteios de habitante, saneamento |
| a ficha | 5 — penteado/traje/acessório, a cor genérica largada, identidade canônica, a bio que não mente, os óculos devolvidos aos habitantes |
| o território da Nexara | 4 — ficha dela intacta, paletas que não se encostam, **sem anel orbital**, `aero` do Criador intacto |
| orçamento | 5 — teto, 3 malhas, custo monotônico, fitas que cortam, emblema que não corta |
| o cabelo | 7 — comprimento, nuca coberta, corredor do braço, assimetria, franja em malha, franja acima do olho, crânio não deformado |
| o traje e o ∞ | 5 — emblema à frente do pano, dois aros, trilha assimétrica, sem babador, luz peça a peça |
| abafadores e visor | 5 — dois lados, arco que não cruza o rosto, visor de um lado só, corte por LOD, nada disso sem o penteado dela |

Suíte completa: **1 241 passam · 11 pulados · 1 falha preexistente**
(`coracao-roseiral`, timeout de 5 s). Rodados isoladamente, os três
arquivos suspeitos dão **o mesmo resultado em `9d96910` e aqui**: a
falha é da base, não do marco. As outras duas falhas vistas numa
execução foram timeouts de contenção com 64 workers em paralelo e não
se reproduzem.

### 7.3 Build

`npm run build` — **651 ms**, sem avisos novos.

### 7.4 O resto do Éden não mudou — e a conta dos quatro divergentes

Esta é a prova que mais importa, porque é a única que pega dano
colateral silencioso. Ela roda com `tools/assinaturas.ts`, uma
ferramenta escrita neste marco e deixada no repositório para os
próximos (a Maze e a Júpiter ainda vêm).

#### O que a assinatura cobre

A primeira versão desta conta olhava só `position` da malha do corpo.
Era fraca em dois sentidos, e os dois foram corrigidos:

- **todos os atributos de geometria** entram no hash, em ordem
  alfabética — `position`, `normal`, `color`, `aFinish`, `skinIndex`,
  `skinWeight` — mais o buffer de índices. Uma peça **repintada sem
  sair do lugar** é uma alteração tão involuntária quanto uma peça
  movida, e a conta antiga a teria deixado passar;
- **as três malhas** do avatar entram (`corpo`, `rosto`, `halo`), não
  só o corpo.

Cada número é arredondado a cinco casas decimais: abaixo disso é
ruído de ponto flutuante, acima disso um deslocamento de décimo de
milímetro passaria batido. Foi um deslocamento de **0,7 mm** que
denunciou o acidente da Akemi.

#### O que a varredura enumera

Amostrar só as fichas do Panteão não bastava. Penteado, traje e
acessório são campos **compartilhados com os habitantes sorteados**,
e um marco que mexa em `curto` ou em `aero` muda gente pelo mundo
todo — sorteio aleatório pode simplesmente não cair no estilo
afetado. Por isso o catálogo inteiro entra, peça a peça:

| grupo | casos |
|---|---|
| Panteão, com a ficha de cada um | 12 × 4 níveis = 48 |
| cada penteado do catálogo | 13 × 4 = 52 *(14 × 4 = 56 depois, com `fibra`)* |
| cada traje do catálogo | 11 × 4 = 44 *(12 × 4 = 48 depois, com `sistema`)* |
| cada acessório do catálogo | 8 × 4 = 32 |
| habitantes sorteados, semente fixa | 60 |
| **total** | **232 antes · 240 depois** |

#### O resultado

| | |
|---|---|
| chaves presentes nos dois lados | **232** |
| idênticas | **228** |
| **divergentes** | **4** |
| chaves novas (só depois) | 8 — `cabelo/fibra` e `traje/sistema`, 4 níveis cada |
| chaves perdidas (só antes) | **0** |

As 8 chaves novas são esperadas e necessárias: são as duas peças que
este marco criou, e elas não podiam existir em `9d96910`. **Zero
chaves perdidas** confirma que nada foi removido do catálogo.

#### Os quatro divergentes, um a um

São exatamente `panteao/haru`, nos quatro níveis de qualidade — e,
dentro de cada um, **só a malha do corpo**:

| nível | malha | antes (`9d96910`) | depois | |
|---|---|---|---|---|
| baixa | `corpo` | `-279154171` | `1334845578` | **muda** |
| média | `corpo` | `-1149277345` | `-1635503639` | **muda** |
| alta | `corpo` | `157457820` | `653359474` | **muda** |
| ultra | `corpo` | `-505680071` | `1390608517` | **muda** |
| todos | `rosto` | `279745785` | `279745785` | igual |
| todos | `halo` | `-1243317816` | `-1243317816` | igual |

**Por que os quatro, e não menos.** A ficha dela trocou de penteado
**e** de traje, e as duas peças existem em todos os níveis: já no LOD
baixo há calota, queda longa, traje grafite e o emblema ∞. Não existe
nível em que a Haru pudesse ter ficado igual. Se um dos quatro
tivesse batido, o suspeito seria o corte de LOD estar errado.

**Por que só a malha do corpo.** `rosto` e `halo` são construções
separadas, e nenhuma das duas depende de penteado, traje ou
acessório. O `rosto` idêntico é a prova independente de que o relevo
dos filamentos **não deformou o crânio** — é o mesmo que o teste
`o relevo dos filamentos não deforma o crânio` mede por outro
caminho, e os dois concordam. O `halo` idêntico confirma que a aura
`0x7fd6ff` não foi tocada.

#### Os controles que tinham de ficar parados

Estes são os casos em que um erro teria sido caro, e todos vieram
**idênticos**:

| chave | por que importa |
|---|---|
| `traje/aero` | é o traje do **Criador Aérion** e da Amara |
| `panteao/aerion` · `panteao/amara` | as duas fichas que usam `aero` |
| `cabelo/curto` | o penteado antigo dela, herdado por habitantes |
| `acessorio/oculos` | o acessório antigo dela, herdado por habitantes |
| `cabelo/cachos` · `panteao/akemi` | onde o acidente da §6 caiu — **confirma a reversão** |
| `panteao/nexara` | a deusa digital vizinha, de marco já fechado |
| 60 habitantes sorteados | o mundo povoado |

**Conclusão:** não há alteração involuntária. As únicas malhas que
este marco mudou são as quatro da Haru, e as únicas chaves novas são
as duas peças que ela estreia.

### 7.5 Bancada

Nove capturas, todas com `ERROS: nenhum` no console:

| arquivo | o que mostra |
|---|---|
| `01-antes-corpo` | a Haru antiga, para comparação |
| `02-depois-corpo` | corpo inteiro |
| `03-rosto` | franja, visor, abafadores de perto |
| `04-costas` | queda, fitas de luz, nuca coberta |
| `05-perfil` | volume da queda, mecha assimétrica |
| `06-andando` | o cabelo em movimento, sem atravessar o corpo |
| `07-noite` | o traje grafite apaga e só a luz fica |
| `08-lod-baixo` | a silhueta que sobra a cinquenta metros |
| `09-elenco` | habitantes sorteados, inalterados |

---

## 8. O que ficou de fora, e por quê

- **Anel orbital** — é a assinatura da Nexara.
- **Peça de quebra-cabeça** — rejeitada pela comunidade autista.
- **`Finish.Glass` no traje inteiro** — `subdivideProfile` descarta o
  acabamento e a perna nua inteira vira vidro. Lição do marco da
  Akemi; a luz entra peça a peça.
- **Remasterizar `aero`, `curto` ou `oculos`** — mexeria no Criador,
  na Amara e nos habitantes sorteados.
- **Maze e Júpiter** — ainda sem marco. Nada foi tocado nelas.
