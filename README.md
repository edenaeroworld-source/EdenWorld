<p align="center">
  <img src="public/assets/ui/logo-edenworld-480.webp" alt="EDENWORLD" width="280" />
</p>

# EDENWORLD — Genesis 0.1

**A World Beyond Imagination.** Um mundo aberto em 3D do universo Éden Aero que roda direto no navegador — no computador, no celular e no tablet, sem instalar nada.

A Genesis 0.1 apresenta **Aurora City**, uma cidade-jardim à beira-mar para explorar a pé com um avatar criado por você.

## O que há nesta versão

- **Aurora City**, com 11 áreas: Praça Central (e a Esfera Aurora), Centro de Aurora, Distrito Cristal, Vila das Nuvens, Parque das Águas, Ilha do Gazebo, Jardins Suspensos, Mirante Celeste, Palco Aurora, Orla Cristalina e Píer da Orla.
- **Criador de avatar**: nome, tom de pele, cabelo, olhos, roupa, cores, acessório e altura. O visual pode ser trocado depois no Ateliê Aero ou pelo EdenPhone.
- **Exploração em terceira pessoa**: andar, correr, pular, nadar, sentar e acenar, com câmera que desvia de obstáculos.
- **128 pontos de interação**: a Esfera Aurora, fontes, bancos, placas, holomapa, painel de eventos, telescópios, portais e o ateliê.
- **Coisas para encontrar**: 24 Cristais de Luz, 31 anotações no diário e 8 portais que, depois de ativados, permitem viagem rápida.
- **EdenPhone**: mapa com viagem rápida, diário, jornada (seu progresso), câmera (modo foto, salva em PNG), céu (hora do dia e clima), avatar e ajustes.
- **Dia e noite** (um dia dura 24 minutos reais) e clima variável: céu limpo, brisa e neblina.
- **Três formas de jogar**, com troca automática entre elas: teclado e mouse, tela de toque e controle. Teclas e botões podem ser remapeados.
- **Configurações** de gráficos (três níveis de qualidade, sombras, reflexos, escala de resolução, resolução dinâmica), áudio, controles e jogo.
- **Salvamento automático** no próprio navegador, com opções de continuar, novo jogo, exportar, importar e apagar.
- **Interface em português do Brasil**, navegável por mouse, toque, teclado e controle.

Os recursos on-line e sociais planejados para o universo Éden (Éden Connect, EdenStore, EdenReads, EdenPawl e os eventos) aparecem no jogo somente como **“em breve”**: nenhum deles simula algo que ainda não existe.

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
| EdenPhone e menu | botões no canto superior direito |

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
npm test            # 96 testes unitários da lógica pura
npm run test:e2e    # cinco cenários de ponta a ponta sobre o build de produção
```

Os **testes unitários** (`tests/unit/`) cobrem matemática, colisão, movimento do personagem, relógio do mundo, aparência do avatar, configuração de controles, níveis de qualidade, interações e salvamento.

Os **testes de ponta a ponta** (`tests/e2e/`) abrem o jogo em um Chromium sem interface e o usam como um jogador:

| Cenário | O que percorre |
| --- | --- |
| `desktop` | Menu, criador, movimento, interações, EdenPhone, modo foto e configurações com teclado e mouse |
| `persistencia` | Salvar, recarregar, continuar, novo jogo, exportar, apagar e importar |
| `celular` | Tela de toque em retrato (390×844) e paisagem (844×390) |
| `controle` | Jogo e menus só com o controle, incluindo conectar e desconectar |
| `robustez` | Navegador sem WebGL2, armazenamento bloqueado, salvamento corrompido ou adulterado, perda do contexto gráfico e limite do mapa |

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
  core/                  Engine (orquestra tudo), laço do jogo, renderizador, configuração
  world/                 terreno, céu, água, luz, clima, relógio, vegetação, partículas
  cities/aurora-city/    planta, prédios, praça, parques e decoração de Aurora City
  physics/               colisão e consultas ao cenário (sem biblioteca externa)
  player/                avatar, animação, aparência e movimento
  camera/                câmera em terceira pessoa
  input/                 teclado e mouse, toque, controle e remapeamento
  interactions/          pontos de interação e colecionáveis
  systems/               qualidade gráfica, salvamento, progresso e áudio
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

- O progresso e as preferências ficam apenas no `localStorage` do navegador, na chave `edenworld.save.v1`.
- O jogo não faz nenhuma requisição de rede depois de carregado: não há conta, anúncios, telemetria nem fontes externas.
- Limpar os dados do navegador apaga o progresso. Em **Configurações → Jogo** é possível exportar o salvamento para um arquivo e importá-lo depois, inclusive em outro navegador ou aparelho. A importação traz o avatar e o progresso; as configurações de cada aparelho são mantidas.

### Parâmetros de URL para desenvolvimento

| Parâmetro | Efeito |
| --- | --- |
| `?quality=baixa`, `media` ou `alta` | Força um nível de qualidade gráfica |
| `?noaudio` | Inicia sem áudio |
| `?skipmenu` | Pula o menu e entra direto no jogo |
| `?debug` | Expõe `window.__eden` (estado e atalhos usados pelos testes) e aceita `x`, `z`, `heading`, `yaw`, `pitch`, `dist` e `h` para posicionar o jogador, a câmera e a hora |

## Limites conhecidos

- **Ainda não testado em aparelhos reais.** Toda a verificação foi automatizada em um Chromium sem interface, com renderização por software. O desempenho em celulares e placas de vídeo reais não foi medido, e o áudio nunca foi ouvido por uma pessoa.
- **Um jogador por vez.** Não há multijogador, contas nem serviços on-line nesta versão.
- **O salvamento é local.** Para continuar em outro navegador ou aparelho é preciso exportar o arquivo de salvamento e importá-lo manualmente.
- **Só Aurora City.** As outras regiões do universo Éden ficam para as próximas versões.
- **Funciona só on-line.** Há manifesto de aplicativo web (ícone e tela cheia ao adicionar à tela inicial), mas não há modo off-line.
