# Marco M — Isolamento de iluminação entre regiões

## O relato

Depois do Marco L, ir de Aurora City para Rosas Park deixava **Rosas Park**
clara demais, como se tudo estivesse com a intensidade elevada. Antes do
Marco L, era Aurora City que voltava lavada de Rosas Park.

A direção inverteu, e essa inversão é a pista. Não é que uma cidade seja
clara demais: **é sempre a cidade onde você chega**. Quem chega, brilha.

## A causa

`Lighting` acrescenta o sol direcional, o alvo do sol e a luz hemisférica
**à cena**, no construtor. O `dispose()` dela chamava `sun.shadow.map.dispose()`,
`sun.dispose()` e `ambient.dispose()` — e mais nada.

No Three.js, `dispose()` libera recursos de GPU. **Ele não desfaz o
`scene.add`.** Uma luz descartada sem ser removida continua pendurada no
grafo, com a última cor e a última intensidade que recebeu, e continua
iluminando normalmente.

A cena vive a sessão inteira; a região vai e vem por baixo dela. Então cada
viagem deixava para trás um sol aceso e uma luz de ambiente acesa, que se
**somavam** às da região seguinte.

Medido com uma sonda descartável, às 14h, sol 3,10 + ambiente 0,72 = 3,82
por região:

| viagens | luzes na cena | intensidade somada |
| ------- | ------------- | ------------------ |
| 0       | 2             | 3,82               |
| 1       | 4             | 7,64               |
| 2       | 6             | 11,46              |
| 4       | 10            | 19,10              |

Exatamente o dobro por viagem. O `dispose()` não mudava uma linha desse
censo.

O mesmo defeito, na mesma forma, com o céu: `Environment` faz
`scene.add(sky.group)` e `scene.add(sky.clouds)` no construtor e nunca os
removia — uma cúpula de céu a mais por viagem, desenhada por cima da
anterior.

### Por que o Marco L pareceu resolver e não resolveu

Eram **dois vazamentos independentes na mesma cena**. O Marco L consertou o
relógio (que voltava para 9h30 a cada `World.build`) e a intensidade de
ambiente (`resetSceneAtmosphere`, que zera `scene.environment`, `scene.fog`
e `scene.environmentIntensity`). Essa parte estava certa e continua no
lugar. As luzes nunca foram tocadas, e continuaram se acumulando.

Trocar o relógio de lugar mudou qual cidade parecia errada, não o fato de
uma delas estar.

## A correção

Quem acende é quem apaga.

- **`src/world/Lighting.ts`** — a cena passou a ser guardada no construtor
  (`private readonly scene`), e `dispose()` agora faz
  `this.scene.remove(this.sun, this.sun.target, this.ambient)` antes de
  liberar os recursos. O alvo do sol entra na lista: ele também é
  acrescentado à cena, e sem removê-lo sobra um objeto por viagem.
- **`src/world/Environment.ts`** — `dispose()` agora também faz
  `this.scene.remove(this.sky.group, this.sky.clouds)`.

**Nenhuma compensação de brilho foi usada.** Não era preciso: com as sobras
removidas, cada região recebe exatamente a iluminação que o modelo de
atmosfera calcula para a hora. Nada foi escurecido para disfarçar o excesso
do outro lado, e os números visuais das duas cidades são os originais.

## A conferência, para a próxima vez

O bug era invisível ao código e visível só ao jogador. Isso agora tem dono.

**`src/world/SceneLighting.ts`** (novo) é um censo de iluminação da cena,
no mesmo espírito do `checkRegionIntegrity`:

- `readSceneLighting(scene)` percorre a cena e devolve quantos sóis, luzes
  de ambiente, céus e nuvens existem, mais a intensidade somada, a
  intensidade de ambiente, a névoa (cor, perto, longe) e se há mapa de
  reflexo. Não altera nada.
- `checkLightingIsolation(scene)` exige **exatamente um** de cada.
- `checkSceneCleared(scene)` exige que uma cena descartada não tenha
  sobrado nada aceso.

`Engine.validateRegion` chama `checkLightingIsolation` na etapa `validar` da
travessia, junto com a conferência de posições e área proibida. Um
vazamento futuro aparece no console na chegada, com nome e número, em vez
de esperar alguém reparar na tela.

## O que foi verificado e estava certo

- **`InteriorScene`** — é um singleton da sessão, criado uma vez; suas luzes
  ficam sob `this.group` e `unload()` faz `removeFromParent()` +
  `dispose?.()` em cada uma. Não é recriada por região, logo não acumula.
  Sem alteração.
- **Tone mapping e exposição** — `toneMapping` e `toneMappingExposure`
  aparecem só em `src/core/Renderer.ts:55-56` (`NeutralToneMapping`, 1.0) e
  não são escritos em nenhum outro lugar de `src/`. Não participavam do bug.
- **`resetSceneAtmosphere`** — a limpeza do Marco L está correta e tem
  cobertura de teste nova (três mutações distintas a matam).

## Os testes

`tests/unit/iluminacao-regioes.test.ts` — 41 testes, com o `Environment`
**de verdade**, contra um renderizador substituto (não há WebGL no ambiente
de teste, mas o vazamento não estava no desenho: estava em quem entra e
quem sai da cena).

Os cenários pedidos:

| | cenário | o que se verifica |
| --- | --- | --- |
| A | Aurora → Rosas de dia | chegar viajando é idêntico a começar ali |
| B | Aurora → Rosas de noite | idem |
| C | Rosas → Aurora de dia | idem |
| D | Rosas → Aurora de noite | idem |
| E | dez ciclos de ida e volta | 20 travessias sem acúmulo de luz, de objetos, nem de intensidade |
| F | abrir direto em cada região | o caminho de carga e o de viagem terminam no mesmo estado |
| G | parâmetros antes e depois | sol, ambiente, intensidade somada, intensidade de ambiente, névoa (cor/perto/longe), cor do sol e hora — comparação de struct inteira |

Mais: o relógio atravessa a viagem em 2h, 9h30, 14h, 19h30 e 23h15; a noite
continua noite e o dia continua dia (com um controle de que dia e noite são
mesmo diferentes, senão a comparação mediria o mesmo nada); cem
acendimentos e apagamentos seguidos não deixam rastro.

E um **controle negativo** que reproduz o bug de propósito — luzes
acrescentadas e só descartadas, sem remover — para que a diferença entre
`dispose` e `remove` fique registrada em teste, não só em comentário.

### Campanha de mutação

17 mutações aplicadas e revertidas uma a uma; **17 mortas, 0 sobreviventes**.

| mutação | testes que falharam |
| --- | --- |
| M1 `Lighting.dispose` sem `remove` (o bug original) | 16 |
| M2 esquece `sun.target` | 3 |
| M3 esquece a luz de ambiente | 16 |
| M4 `Environment.dispose` não remove céu nem nuvens | 8 |
| M5 esquece só as nuvens | 7 |
| M6 `resetSceneAtmosphere` não zera `environmentIntensity` | 1 |
| M7 não limpa a névoa | 2 |
| M8 não limpa o mapa de reflexo | 1 |
| M9–M14 auditoria ignora cada tipo de sobra ou falta | 1–2 cada |
| M15–M16 `checkSceneCleared` ignora névoa / intensidade | 1 cada |
| M17 o motor não chama mais a auditoria | 1 |

Três delas (M10, M11, M12) **sobreviveram na primeira rodada** e revelaram
buracos reais: a auditoria de céus não era exercitada, um censo que sempre
devolvesse zero passaria em toda comparação antes/depois (0 é igual a 0), e
`checkSceneCleared` nunca era testado contra uma cena suja. Os testes foram
reforçados e as três passaram a morrer.

## Validação visual

**Não foi possível.** Este ambiente não tem WebGL — o servidor de
desenvolvimento responde HTTP 200, mas nada renderiza sem placa de vídeo, e
não há navegador disponível para abrir o jogo. As capturas de tela pedidas
no item 6 não foram feitas.

O que há no lugar delas é medição: a intensidade somada da cena, que é o
número que o olho lê como "brilho", comparada entre chegar viajando e
começar na região, em dia e em noite, nas duas direções, por vinte
travessias seguidas. É forte, e não é a mesma coisa que olhar. A conferência
visual na tela continua pendente de alguém com o jogo aberto.

## Arquivos

**Modificados**

- `src/world/Lighting.ts` — a cena guardada no construtor; `dispose()`
  remove sol, alvo e luz de ambiente.
- `src/world/Environment.ts` — `dispose()` remove céu e nuvens.
- `src/core/Engine.ts` — `validateRegion` passou a conferir a iluminação.

**Novos**

- `src/world/SceneLighting.ts` — o censo e as duas auditorias.
- `tests/unit/iluminacao-regioes.test.ts` — 41 testes.
- `docs/PLANO-ILUMINACAO-REGIOES.md` — este documento.

## Portão

`typecheck` 0 erros · `vitest run` 935 passaram / 5 pulados (940) ·
`build` ✓ 562 ms.
