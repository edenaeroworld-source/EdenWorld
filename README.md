<p align="center">
  <img src="public/assets/ui/logo-edenworld-480.webp" alt="EDENWORLD" width="280" />
</p>

# EDENWORLD — Genesis 0.2 · “A cidade ganha gente”

**A World Beyond Imagination.** Um mundo aberto em 3D do universo Éden Aero que roda direto no navegador — no computador, no celular e no tablet, sem instalar nada.

**Aurora City** é uma cidade-jardim à beira-mar para explorar a pé com um avatar criado por você — agora habitada: moradores com rotina própria que olham, cumprimentam e conversam entre si, as onze figuras do panteão do Éden em seus lugares, um EdenOS com aplicativos que funcionam de verdade e a tecnologia **Afters** liberada por Luma.

## O que há nesta versão

- **Aurora City**, com 11 áreas: Praça Central (e a Esfera Aurora), Centro de Aurora, Distrito Cristal, Vila das Nuvens, Parque das Águas, Ilha do Gazebo, Jardins Suspensos, Mirante Celeste, Palco Aurora, Orla Cristalina e Píer da Orla.
- **Criador de avatar**: nome, tom de pele, cabelo, olhos, roupa, cores, acessório e altura. O visual pode ser trocado depois no Ateliê Aero ou pelo EdenPhone.
- **Exploração em terceira pessoa**: andar, correr, pular, nadar, sentar e acenar, com câmera que desvia de obstáculos.
- **Rosto e gestos**: o avatar tem sobrancelhas, pálpebras e boca de verdade, com **sete expressões**, piscada automática e boca que acompanha a fala. São **13 gestos** (acenar, cumprimentar, falar, concordar, negar, pensar, apontar, rir, surpresa, despedir, aplaudir, espreguiçar e a mão no ventre, de Amara) e todos funcionam **enquanto você anda**: o gesto é de tronco para cima e as pernas continuam no passo.
- **128 pontos de interação**: a Esfera Aurora, fontes, bancos, placas, holomapa, painel de eventos, telescópios, portais e o ateliê.
- **Coisas para encontrar**: 24 Cristais de Luz, 31 anotações no diário e 8 portais que, depois de ativados, permitem viagem rápida.
- **Habitantes de Aurora City**: 54 moradores simulados ao mesmo tempo (até 18 visíveis, conforme a qualidade), cada um com nome, ocupação, roupa, velocidade e rotina que muda de madrugada, manhã, tarde e noite. Dá para conversar com qualquer um.
- **A cidade repara em você.** A nove metros o morador vira a cabeça e acompanha; a cinco e meio ele cumprimenta — no máximo uma vez a cada 26 segundos por pessoa, e nunca de madrugada, quando a cidade está quieta. Dois moradores que se cruzam param, se viram um para o outro e conversam por alguns segundos, com gesto e expressão. Aperte `G` numa praça cheia e quem estiver por perto **responde ao aceno**, cada um no seu tempo — não em bloco.
- **Cada pessoa tem um jeito.** Os gestos preferidos, o humor da saudação e a frequência com que se mexe vêm de uma *persona*: Suki‑Chan gesticula sem parar, Saturno quase não se move, Haru demora mais para começar.
- **O panteão em pessoa**: Aérion, Haru, Nexara, Suki‑Chan, Luma, Lilly, Akemi‑Chan, Saturno, Maze, Júpiter e Amara estão em pontos fixos da cidade, com aura, plaquinha de nome, diálogo em árvore, registro no diário e contato no EdenPhone. As falas da árvore de cada um trazem direção de atuação: o nó diz qual expressão e qual gesto acompanham aquela frase, então Suki comemora, Saturno pondera e Amara mede a distância.
- **Um universo, não uma cidade**: sete regiões permanentes — Aurora City, Bitnara, SkyStones, Rosas Park, Noureja Nether, Cidade da Liberdade e Jardim Proibido. Regiões **não são fases**: não há seleção de nível nem ordem obrigatória, e tudo atravessa a viagem (cristais, inventário, bichos, casa, atividades). Você descobre uma região conversando com quem cuida dela — e duas delas só aparecem para quem as achar. Aurora City e **Rosas Park** têm cenário 3D construído, com interiores que se entra de verdade e bichos selvagens desenhados; as outras já existem no mapa, nas lojas, na fauna e nas atividades, e a tela diz isso em vez de levar você para o vazio. Ver [`docs/PLANO-UNIVERSO-VIVO.md`](docs/PLANO-UNIVERSO-VIVO.md) e [`docs/PLANO-ROSAS-3D.md`](docs/PLANO-ROSAS-3D.md).
- **Economia com consequência**: a moeda é o Cristal. Trinta itens em sete marcas (EdenTech, EdenGame, Afters Store, EdenPawl, EdenHome, EdenFashion, EdenMusic), treze lojas com horário real, devolução com prazo e extrato. Nenhum botão de compra é enfeite: o computador comprado na EdenTech vira um objeto que você instala em casa.
- **Casa própria**: quatro imóveis para comprar ou alugar, com grade de colisão de meio metro — o sofá não entra dentro da cama, e girar um móvel troca a largura pela profundidade de verdade.
- **EdenPawl**: oito espécies domésticas adotáveis, treze selvagens e cinco criaturas originais do Éden, num registro aberto. As necessidades caem devagar e mexem no humor, **nunca na saúde**: nenhum bicho morre, adoece ou é tirado de você por descuido. E animal selvagem não vira bicho de estimação — Saturno é clara quanto a isso.
- **Amara, Deusa da Maternidade**: o domínio dela é o cuidado com o que ainda está começando, e ela está grávida. A gestação é parte de quem ela é — aparece na silhueta do avatar em qualquer ângulo, de qualquer aparelho, e o gesto *mão no ventre* entra sozinho nas conversas dela. É um traço de personagem (`EdenCharacter.gestation`), **não** um canal Afters: não existe controle para aplicar gestação a ninguém. A matemática vive em [`src/player/Gestation.ts`](src/player/Gestation.ts), espelhada TS ↔ GLSL como a dos Afters, e a prova visual é `docs/amara-gestacao.png`.
- **A conversa acontece no mundo, não por cima dele.** A fala aparece numa barra no pé da tela, com a cidade visível e iluminada atrás; o texto é datilografado com as pausas da pontuação, dá para pular com um toque, há histórico das últimas falas e as escolhas só aparecem quando a pessoa termina de falar. Enquanto conversam, os dois ficam virados um para o outro e a cabeça acompanha.
- **Voz**: o jogo **não tem dublagem** e não finge ter. Em **Configurações → Áudio** existe a opção **Falas**: no padrão (*texto*) a boca do personagem se mexe no ritmo da datilografia; em *síntese* o jogo usa a voz sintética do próprio navegador, de graça e sem servidor, com tom e velocidade próprios de cada figura do panteão. Se um dia houver clipes gravados, eles entram no lugar sem mudar mais nada — a estrutura já está pronta e é entregue vazia.
- **EdenOS no EdenPhone**, com 14 aplicativos: mapa com viagem rápida, diário, jornada, câmera (foto em PNG), céu, **Pessoas**, **EdenTalk**, **EdenGram**, **EdenFeed**, **EdenReads**, **Afters**, **EdenMusic**, eventos e ajustes.
- **Afters 2.0 (Body Expansion Tech)**: seis produtos do cânone — AfterBust®, AfterCurve®, GelGrow®, CandyGrow®, AfterLove e AfterVelvet — liberados por Luma no Ateliê Aero.
  - **AfterBust®** e **AfterCurve®** são os dois produtos que **transformam o avatar**: silhueta superior e silhueta inferior, de **0% a 250%**, cada um com interruptor, slider, leitura numérica e botão **Reiniciar** próprios. Podem ser usados separados ou **combinados**, ligados e desligados de forma independente, e ajustados **enquanto você anda, corre ou conversa** — sem recarregar a cena, sem teleporte e sem trocar de avatar. A duração da transição é um controle à parte da intensidade. Em 0% a silhueta original volta exatamente como era.
  - Os outros quatro produtos (GelGrow®, CandyGrow®, AfterLove, AfterVelvet) são **efeitos complementares** — anel de presença, halo e partículas em volta do corpo. Ficam numa seção à parte, com cor, intensidade, som e desligamento manual: nunca substituem a transformação. A luz de assinatura do AfterBust® e do AfterCurve® fica dentro da seção de cada um.
  - Desligar guarda a porcentagem escolhida; **Reiniciar** volta ao padrão de 0%. Intensidades, ativações, duração e preset são gravados no salvamento.
  - **A cidade também usa.** Os moradores de Aurora City e as figuras do panteão passam pela mesma tecnologia, pelo mesmo sistema: cada um com a própria configuração de 0% a 250%, nos dois canais, separados ou combinados, estável enquanto a pessoa anda, corre ou está parada. Quem usa e quanto depende do perfil — a artista arrisca mais, o cuidador quase não usa —, e a escolha é sorteada da semente do habitante, então a cidade é a mesma em toda sessão. À noite quem tem esse gosto reforça um pouco; no **Palco Aurora** a cidade inteira sobe o tom. Um roteiro pode ligar, desligar ou trocar o preset de uma pessoa específica, e essa mudança é gravada no salvamento.
- **Dia e noite** (um dia dura 24 minutos reais) e clima variável: céu limpo, brisa e neblina.
- **Um jogo só, em qualquer aparelho.** Não existe versão mobile: a mesma Aurora City, os mesmos moradores e o mesmo progresso rodam no computador, no Android e no iPhone/iPad. O jogo reconhece o aparelho sozinho — inclusive o iPad, que se apresenta como Mac, e o tablet Android, que omite a palavra *Mobile* — e escolhe o comando adequado. Em **Configurações → Teclado e toque** dá para fixar o esquema à mão (automático, teclado e mouse, tela de toque ou controle): serve para o tablet com teclado acoplado e para o notebook de tela sensível.
- **Três formas de jogar**, com troca automática entre elas: teclado e mouse, tela de toque e controle. Teclas e botões podem ser remapeados.
- **Deitado ou em pé.** A tela de toque funciona nas duas orientações: deitado se vê mais cidade (e o jogo sugere isso uma vez, sem obrigar), em pé a interface se reorganiza — analógico mais alto, botões menores, EdenPhone ocupando a largura.
- **Configurações** de gráficos (**quatro** níveis de qualidade — Baixa, Média, Alta e Ultra —, meta de **30 ou 60 FPS**, sombras, reflexos, escala de resolução, resolução dinâmica), áudio (incluindo volume de **voz** e o modo das **falas**), controles e jogo. Cada nível mexe em resolução, sombra, distância de visão, densidade de partículas, efeitos de ambiente e também na **frequência de simulação dos moradores** — a parte que mais pesa num celular.
- **Salvamento automático** no próprio navegador, com opções de continuar, novo jogo, exportar, importar e apagar.
- **Interface em português do Brasil**, navegável por mouse, toque, teclado e controle.

Os recursos que ainda dependem de servidor, loja ou catálogo licenciado (Éden Connect, EdenStore, EdenTV, EdenGame, EdenPawl e os eventos com data) continuam aparecendo apenas como **“em breve”**: nenhum deles simula algo que não existe. Os aplicativos sociais que **existem** dizem, dentro da própria tela, que tudo fica guardado só naquele aparelho — não há conta, servidor nem outras pessoas on‑line.

## Como jogar

### Teclado e mouse

| Ação | Comando |
| --- | --- |
| Andar | `W` `A` `S` `D` ou setas |
| Correr | `Shift` |
| Pular | `Espaço` |
| Interagir | `E` ou `Enter` |
| EdenPhone | `Tab` ou `P` |
| Acenar | `G` |
| Centralizar a câmera | `C` |
| Pausar / menu | `Esc` |
| Girar a câmera | mover o mouse (clique no jogo para capturar o cursor) ou arrastar |
| Zoom | roda do mouse |

### Tela de toque

| Ação | Comando |
| --- | --- |
| Andar | analógico virtual no lado esquerdo da tela |
| Girar a câmera | arrastar o dedo no restante da tela |
| Zoom | movimento de pinça |
| Pular, correr e interagir | botões no canto inferior direito |
| EdenPhone e pausa | botões dedicados acima dos de ação, à direita |
| Orientação | funciona deitado e em pé; deitado se vê mais cidade |

Durante o jogo, a pinça e o menu de toque longo do navegador ficam
bloqueados sobre a cena 3D — mas rolar com um dedo nas listas, no feed e nas
configurações continua funcionando normalmente, e fora do jogo o navegador
volta ao comportamento de sempre.

### Controle (padrão Xbox / PlayStation)

| Ação | Comando |
| --- | --- |
| Andar | analógico esquerdo |
| Girar a câmera | analógico direito |
| Pular | `A` / Cruz |
| Correr | `RT` / `R2` |
| Interagir | `X` / Quadrado |
| EdenPhone | `Y` / Triângulo |
| Acenar | direcional para cima |
| Centralizar a câmera | `R3` |
| Zoom | `LB` e `RB` |
| Pausar / menu | `Start` / `Options` |

Nos menus: direcional ou analógico esquerdo para navegar, `A` confirma, `B` volta, `LB`/`RB` trocam de aba.

As teclas e os botões de ação podem ser trocados em **Configurações**.

## Requisitos

- Para jogar: um navegador atual com **WebGL2** (Chrome, Edge, Firefox ou Safari recentes). Sem WebGL2, o jogo mostra uma tela de aviso em vez de abrir.
- Para desenvolver: **Node.js 22.12** ou mais novo (de preferência uma versão LTS) e npm.

## Rodando o projeto

```bash
npm install      # instala as dependências
npm run dev      # servidor de desenvolvimento em http://localhost:5173
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Confere os tipos e gera a versão de produção na pasta `dist/` |
| `npm run preview` | Serve a pasta `dist/` em http://localhost:4173 para conferência |
| `npm run typecheck` | Só a checagem de tipos do TypeScript |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | Gera o build e roda os testes de ponta a ponta em um Chromium sem interface |

Para abrir o servidor de desenvolvimento por um túnel ou outro domínio, informe os hosts permitidos:

```bash
EDENWORLD_ALLOWED_HOSTS=".meu-tunel.dev" npm run dev
```

## Publicação

O jogo é um **site estático**: `npm run build` gera a pasta `dist/` (cerca de 1,7 MB; aproximadamente 260 kB de código compactado com gzip) e basta hospedar o conteúdo dela. Não há servidor, banco de dados nem variáveis de ambiente.

- Os caminhos são relativos (`base: './'` no `vite.config.ts`), então o jogo funciona tanto na raiz de um domínio quanto em uma subpasta, como `https://usuario.github.io/EdenWorld/`.
- Sirva por **HTTPS**: alguns navegadores só liberam o uso do controle em páginas seguras.
- Qualquer hospedagem de arquivos estáticos serve: GitHub Pages, Netlify, Vercel, Cloudflare Pages, itch.io (envie o conteúdo de `dist/` em um arquivo `.zip`) ou um servidor próprio.

### Exemplo: GitHub Pages

No plano gratuito do GitHub, o Pages só está disponível para repositórios públicos. Para publicar automaticamente a cada atualização do ramo `main`, ative **Settings → Pages → Source: GitHub Actions** e crie o arquivo `.github/workflows/publicar.yml`:

```yaml
name: Publicar no GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Este arquivo não faz parte do repositório: a escolha da hospedagem fica com quem publica.

## Testes

```bash
npm run typecheck   # tipos
npm test            # 448 testes unitários (lógica pura, sistemas e telas do EdenOS)
npm run test:e2e    # cinco cenários de ponta a ponta sobre o build de produção
```

Os **testes unitários** (`tests/unit/`) cobrem matemática, colisão, movimento do personagem, relógio do mundo, aparência do avatar, configuração de controles, níveis de qualidade, interações e salvamento (incluindo a migração da versão 1 para a 2). Desde a Genesis 0.2 também cobrem a rede de caminhada e a rotina dos habitantes, a coerência do panteão e das árvores de diálogo, o acervo do EdenReads, o estado social do aparelho, o catálogo Afters e a transformação de silhueta do Afters 2.0 (0%, mínimo, máximo, valores intermediários, canais separados, modo combinado, desligamento independente, mudança ao vivo, persistência e compatibilidade com salvamentos antigos) — e, para a cidade, que habitante e jogador usam o mesmo ator de silhueta, que avatares reaproveitados não herdam a silhueta de quem saiu, que transformar ninguém reconstrói malha, que gente longe é atualizada em frequência reduzida sem perder o destino, e que o mesmo habitante fica igual para dois jogadores — e, em um DOM de teste (`happy-dom`), **as telas dos aplicativos**: cada botão precisa chamar o jogo de verdade, nenhum é enfeite.

A Genesis 0.2 acrescentou ainda a cobertura do **diálogo e da vida social**: a datilografia e suas pausas, a barra de fala (histórico, marcador de página, escolhas que só aparecem quando a pessoa termina de falar), a regência da conversa (expressão, gesto, olhar e encerramento), a direção de atuação das árvores do panteão, os 13 gestos — com a garantia de que **nenhum deles toca nas pernas**, para continuarem funcionando enquanto o personagem anda —, os alvos de morph do rosto, as regras de notar, cumprimentar e conversar dos moradores, o giro suave para o interlocutor e os três degraus do sistema de voz (clipe, síntese do navegador, texto), incluindo a verificação de que, sem clipes e sem síntese, o jogo **não promete dublagem**.

Os **testes de ponta a ponta** (`tests/e2e/`) abrem o jogo em um Chromium sem interface e o usam como um jogador:

| Cenário | O que percorre |
| --- | --- |
| `desktop` | Menu, criador, movimento, interações, EdenPhone, modo foto e configurações com teclado e mouse |
| `persistencia` | Salvar, recarregar, continuar, novo jogo, exportar, apagar e importar |
| `celular` | Tela de toque em retrato (390×844) e paisagem (844×390) |
| `controle` | Jogo e menus só com o controle, incluindo conectar e desconectar |
| `robustez` | Navegador sem WebGL2, armazenamento bloqueado, salvamento corrompido ou adulterado, perda do contexto gráfico e limite do mapa |

> **Atenção:** os cenários de ponta a ponta da Genesis 0.2 **não foram executados** nesta máquina — não há Chrome/Chromium instalado e o download está bloqueado. Rode-os localmente antes de publicar.

```bash
node tests/e2e/run.mjs celular controle                   # só alguns cenários (exige "npm run build" antes)
EDEN_URL=http://localhost:5173/ node tests/e2e/run.mjs    # testa um servidor que já está no ar
```

O executor procura um Chrome, Chromium ou Edge instalado. Se não encontrar, informe o caminho em `EDEN_CHROME`. As capturas de tela vão para `tests/e2e/artifacts/` (fora do Git; mude com `EDEN_ARTIFACTS`). Em máquinas sem placa de vídeo a renderização é feita por software e a suíte completa leva de 10 a 15 minutos.

## Estrutura

```text
index.html               página única do jogo
public/                  logotipo, ícones e manifesto do aplicativo web
design/brand/            logotipo original e a origem dos arquivos derivados
src/
  main.ts                ponto de entrada: checa o WebGL2 e inicia o Engine
  core/                  Engine (orquestra tudo), laço do jogo, renderizador, configuração, detecção de plataforma
  world/                 terreno, céu, água, luz, clima, relógio, vegetação, partículas
  cities/aurora-city/    planta, prédios, praça, parques e decoração de Aurora City
  npc/                   rede de caminhada, rotina, vida social e desenho dos moradores
  characters/            panteão do Éden (dados, lugares, árvores de diálogo e personas)
  edenos/                acervo do EdenReads e estado social do aparelho
  afters/                catálogo, transformação de silhueta e efeitos em volta do avatar
  physics/               colisão e consultas ao cenário (sem biblioteca externa)
  player/                avatar, animação, gestos, rosto e movimento
  camera/                câmera em terceira pessoa
  input/                 teclado e mouse, toque, controle, remapeamento e guarda de gestos do navegador
  interactions/          pontos de interação e colecionáveis
  systems/               qualidade gráfica, medição de desempenho, salvamento, progresso, áudio e voz
  interface/             HUD, menus, criador de avatar, EdenPhone e configurações
  styles/                folha de estilo da interface
  utils/                 matemática e geometria de apoio
  shared/                catálogo dos recursos “em breve”
  eden-connect/, social/ pontos de extensão para os futuros recursos on-line
tests/
  unit/                  testes unitários (Vitest)
  e2e/                   testes de ponta a ponta (puppeteer-core)
```

Feito com **TypeScript**, **Three.js** (WebGL2) e **Vite**. Não há motor de jogo, biblioteca de física nem framework de interface.

### Conteúdo gerado por código

Modelos, texturas, céu, água, vegetação, sons e música são gerados em tempo de execução. O único arquivo de imagem do jogo é o logotipo (`public/assets/ui/`) e os ícones derivados dele. Por isso o download é pequeno e não há dependência de arquivos de terceiros.

### Dados e privacidade

- O progresso e as preferências ficam apenas no `localStorage` do navegador, na chave `edenworld.save.v1` (formato na versão 2; salvamentos da versão 1 continuam sendo aceitos).
- As fotos do EdenGram, os contatos, as conversas lidas e os ajustes de Afters são gravados nesse mesmo salvamento, no próprio aparelho. O EdenGram guarda no máximo 12 fotos, em miniatura, para não estourar o armazenamento do navegador.
- O jogo não faz nenhuma requisição de rede depois de carregado: não há conta, anúncios, telemetria nem fontes externas.
- Limpar os dados do navegador apaga o progresso. Em **Configurações → Jogo** é possível exportar o salvamento para um arquivo e importá-lo depois, inclusive em outro navegador ou aparelho. A importação traz o avatar e o progresso; as configurações de cada aparelho são mantidas.

### Parâmetros de URL para desenvolvimento

| Parâmetro | Efeito |
| --- | --- |
| `?quality=baixa`, `media`, `alta` ou `ultra` | Força um nível de qualidade gráfica |
| `?bench` ou `?bench=45` | Mede o desempenho real do aparelho (padrão: 20 s) e imprime média, mediana, **1% pior** e quadros dentro da meta |
| `?noaudio` | Inicia sem áudio |
| `?skipmenu` | Pula o menu e entra direto no jogo |
| `?debug` | Expõe `window.__eden` (estado e atalhos usados pelos testes) e aceita `x`, `z`, `heading`, `yaw`, `pitch`, `dist` e `h` para posicionar o jogador, a câmera e a hora |

Com `?debug`, para desempenho e aparelho: `__eden.plataforma()` mostra o que foi detectado (sistema, formato, esquema e orientação), `__eden.medir(30)` roda uma medição de 30 segundos e `__eden.desempenho()` devolve o último relatório. Além do que já existia: `__eden.npcs()` lista a população e onde está cada figura do panteão, `__eden.irPara('haru')` leva você até ela, `__eden.bandeiras()` mostra as marcas de história e `__eden.afters()` mostra o estado do painel Afters, incluindo `body` (intensidades e ativações) e `silhueta` (o que o avatar mostra neste instante, com a transição em andamento). Para a cidade: `__eden.aftersCidade()` resume quantos habitantes usam a tecnologia e qual evento está em vigor, `__eden.aftersNpc('cidadao:41', { bust: 150 })` muda uma pessoa, `__eden.aftersNpcPreset('cidadao:41', 'aurora')` aplica um preset e `__eden.aftersEvento('palco')` força um evento de cidade.

## Limites conhecidos

- **O desempenho em celular não foi medido.** As metas do projeto são 30 FPS estáveis em celular intermediário e a opção de 60 FPS em hardware capaz — são **metas**, não resultados verificados: não há aparelho móvel nem GPU no ambiente em que o jogo foi desenvolvido. Para produzir o número no seu aparelho, abra o jogo com `?bench` (veja os parâmetros de URL acima). O áudio também nunca foi ouvido por uma pessoa.
- **Um jogador por vez.** Não há multijogador, contas nem serviços on-line nesta versão. O formato de troca da silhueta — do jogador e dos habitantes — já existe e é testado (`src/afters/AftersNet.ts`), mas nada é enviado: não há servidor para receber.
- **O salvamento é local.** Para continuar em outro navegador ou aparelho é preciso exportar o arquivo de salvamento e importá-lo manualmente.
- **Duas regiões construídas, cinco por construir.** Aurora City e Rosas Park têm cenário 3D, interiores visitáveis e fauna desenhada. Bitnara, SkyStones, Cidade da Liberdade, Noureja Nether e o Jardim Proibido são destinos reais no mapa, nas lojas e nas atividades, mas ainda sem cenário — a tela diz isso em vez de levar você para o vazio.
- **Não há dublagem.** Nenhuma fala do jogo foi gravada por uma pessoa. O modo padrão é texto, com a boca acompanhando a datilografia; a síntese do navegador é opcional e depende de o navegador oferecê‑la (a tela de ajustes avisa quando não oferece). O lugar dos clipes existe no código e é entregue vazio.
- **O rosto é estilizado.** São sete expressões desenhadas, não um sistema de músculos faciais: a boca abre e fecha no ritmo da fala, sem visema por fonema.
- **A conversa entre dois moradores é mímica.** Eles param, se viram e gesticulam; não há texto trocado entre eles, e nenhuma tela sugere que haja.
- **As conversas não têm resposta por mensagem.** O EdenTalk mostra o que cada figura do panteão já disse e diz, na própria tela, que responder depende do Éden Connect; para conversar de verdade é preciso procurar a pessoa na cidade.
- **Afters muda a silhueta, não a anatomia.** O avatar é estilizado, feito de primitivas, e continua assim — para o jogador e para os habitantes: AfterBust® e AfterCurve® mudam o **volume suave** de uma região (com a roupa acompanhando), nunca detalhe anatômico. Não há câmera voltada para o corpo, o painel sempre mostra a porcentagem exata e o desligamento manual — inclusive "Desligar tudo" — está sempre à mão.
- **A noite ainda não é a Era Vice Éden.** O EdenFeed já reconhece o período, mas a identidade visual própria da noite (néon, pôr do sol tropical) entra numa etapa seguinte.
- **Funciona só on-line.** Há manifesto de aplicativo web (ícone e tela cheia ao adicionar à tela inicial), mas não há modo off-line.
