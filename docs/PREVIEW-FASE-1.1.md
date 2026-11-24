# Inspeção visual na prévia real — Fase 1.1

Validação feita **no navegador**, com a aplicação servida em `localhost:5173`.
Nenhum código foi alterado nesta etapa. Nada foi commitado, nem mesclado, nem
publicado.

## Como foi possível rodar um navegador aqui

O sandbox não traz Chromium, Firefox, `libGL`, X nem Xvfb, e os CDNs de
binários de navegador (`storage.googleapis.com`, `playwright.azureedge.net`)
estão fora do alcance de rede. As rodadas anteriores registraram isso como
limitação e usaram um rasterizador próprio.

Desta vez havia um caminho: o registro npm **está** acessível, e o pacote
`@sparticuz/chromium` publica o binário **dentro do próprio tarball**, junto
com as bibliotecas de sistema (`al2023.tar.br`) e o **SwiftShader**. Instalado
fora do repositório, extraído com `LD_LIBRARY_PATH`, resultou em:

```
Chromium 153.0.8010.0
WebGL 2.0 — ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)
perfis: baixa→baixa · media→media · alta→alta+pbr · ultra→ultra+pbr
```

É **WebGL 2.0 de verdade**, com os shaders do jogo e o perfil PBR ativo em
`alta` e `ultra` — exatamente o que o rasterizador não reproduzia. O controle
foi feito com o `puppeteer-core` que já estava no projeto.

Limitação que permanece: o SwiftShader é um renderizador **por software**. A
imagem é fiel; a **taxa de quadros não é** (≈20 fps na bancada). Qualquer
número de desempenho daqui não vale como medida de hardware real.

## O que foi conferido

| Item | Resultado |
|---|---|
| Menu, cartões Ele/Ela, identidade Frutiger Aero | ✓ |
| Fluxo das 6 etapas, ida e volta | ✓ |
| Catálogo Ela no app | **20 cabelos · 10 roupas · 7 acessórios** |
| Catálogo Ele no app | **13 cabelos · 10 roupas · 7 acessórios** |
| Vazamento de peça exclusiva nos catálogos | **nenhum** |
| Botão Aleatório (8 sorteios) | 8 combinações distintas, silhueta estável, nada exclusivo |
| `tranca` corrigida, 4 ângulos e 4 níveis | ✓ fio contínuo, nós preservados |
| `trancinhas`, `moicano`, `pixie`, `meiopreso`, `repicado` | ✓ sem peça solta |
| `macacao`, `maio`, `tunica` | ✓ montam certo |
| Aérion: corpo cósmico, nebulosas, estrelas | ✓ |
| Aérion: auréola acesa desde a construção | ✓ |
| Aérion: cabelo Cosmos e traje Criador | ✓ (`custos` da bancada: `ultra cosmos`) |
| Aérion nos 4 níveis | ✓ acabamento e auréola sobrevivem |
| Movimento do campo cósmico | ✓ medido (ver abaixo) |
| As 11 fichas do Panteão lado a lado | ✓ íntegras e distintas |
| Tela estreita 390×844 | ✓ sem rolagem horizontal |
| Erros de console / rede em todas as sessões | **zero** |

### Movimento do acabamento cósmico

Com a câmera **travada** e dois instantes separados por 2,6 s:

| sujeito | média por canal | pixels mudados |
|---|---|---|
| Aérion (campo cósmico) | 11,97 | **26,16 %** |
| Luma (controle, sem campo) | 1,25 | 4,44 % |

O campo do Aérion anima. O resíduo do controle é a cena viva (céu, nuvens,
respiração).

## Defeito encontrado — CORRIGIDO (ver o fim deste documento)

### A trilha de etapas não acompanha a etapa ativa

**Reproduzível em 1280×900 e em 390×844.**

A `.stepper` é uma faixa com `overflow-x: auto`, a barra de rolagem é escondida
de propósito (`scrollbar-width: none` e `::-webkit-scrollbar { display: none }`,
`src/styles/main.css`), e `AvatarCreator.ts` **não chama `scrollIntoView`** em
lugar nenhum. Como `render()` reconstrói a trilha a cada etapa, o `scrollLeft`
volta a zero sempre.

Medido em 1280×900, caixa visível em `x 859..1243`:

| etapa | posição da aba ativa | visível |
|---|---|---|
| 1. Rosto | 859..941 | sim |
| 2. Cabelo | 947..1036 | sim |
| 3. Roupa | 1042..1128 | sim |
| 4. Acessórios | 1134..1249 | **não** (corta) |
| 5. Ajustes | 1255..1348 | **não** |
| 6. Pronto | 1354..1443 | **não** |

`scrollLeft` permanece `0` nas seis.

**Efeito para quem joga:** da etapa 4 em diante a trilha mostra "1. Rosto …
4. Ace" com **nenhuma aba marcada** — o jogador perde a indicação de onde está,
e as etapas 5 e 6 não são clicáveis sem arrastar uma faixa cuja barra de
rolagem está escondida. Em 390×844 acontece o mesmo nas etapas 5 e 6.

Imagem: `docs/preview-1.1/03-defeito-stepper.jpg` (etapa "Pronto", nenhuma aba
acesa) e `02-fluxo-tela-estreita.jpg`.

**Corrigido depois, com autorização** — ver a última seção.

## Observações que não são defeito desta fase

1. **Boca vermelha no Aérion.** O `look()` de `Pantheon.ts` não recebe cor de
   boca; ela vem do padrão do construtor e destoa da pele cósmica. É anterior à
   Fase 1.1 e idêntica a `dc1386f`.
2. **Túnica lê como vestido longo** nos dois corpos — confirmado na prévia
   (`07-roupas.jpg`). É a decisão estética que você adiou.
3. **`meiopreso` parece um bloco preto chapado** com cabelo escuro. Refeito com
   cor clara, o volume aparece modelado e afinado: é leitura de cor em sombra,
   **não** defeito de geometria.
4. **`moicano` é discreto** de perfil; com cor clara a crista aparece presa à
   calota, sem tufo solto.

## Capturas

Em `docs/preview-1.1/`, todas tiradas do navegador:

| arquivo | o que mostra |
|---|---|
| `01-menu.jpg` | menu inicial, identidade Frutiger Aero |
| `02-fluxo-tela-estreita.jpg` | as 8 telas do fluxo em 390×844 |
| `03-defeito-stepper.jpg` | o defeito acima |
| `04-tranca-4-angulos.jpg` | trança em frente, 3/4, perfil e costas |
| `05-tranca-4-niveis.jpg` | trança em ultra, alta, media e baixa |
| `06-cabelos.jpg` | trancinhas, moicano, pixie, meiopreso |
| `07-roupas.jpg` | macacão, maiô e túnica (nos dois corpos) |
| `08-aerion-aureola.jpg` | auréola acesa, cabelo Cosmos, estrelas no rosto |
| `09-aerion-4-niveis.jpg` | Aérion nos quatro níveis |
| `10-panteao-11.jpg` | as onze fichas lado a lado |

---

# Correção da trilha de etapas

Autorizada depois do relatório acima. **Um arquivo de código tocado:**
`src/interface/AvatarCreator.ts`. O CSS **não** foi alterado: esconder a barra
de rolagem continua sendo a escolha estética certa — o que faltava era a faixa
andar sozinha.

## O que foi feito

1. **`alvoDaTrilha(caixa, conteudo, inicio, largura)`** — função exportada e
   pura, que devolve onde a faixa tem de parar: centraliza a aba ativa quando
   há folga e trava o resultado entre zero e o fim do conteúdo, para nunca
   passar da última aba nem recuar antes da primeira.
2. **`mostrarEtapaAtiva(trilha)`** — mede a aba acesa e aplica o valor. Usa
   `scrollLeft` da própria faixa em vez de `scrollIntoView`, porque
   `scrollIntoView` também rola os ancestrais e podia arrastar a página.
3. A chamada acontece em `renderStep`, **depois** de a faixa entrar no
   documento.

O ponto 3 foi o que decidiu a correção, e só apareceu porque ela foi medida.
A primeira versão chamava o ajuste de dentro de `stepper()`, com o elemento
ainda solto: sem layout, os retângulos vinham zerados, o ajuste caía fora e
tudo passava a depender do `requestAnimationFrame` de reserva. Na conferência
isso falhou ao voltar da etapa 6 para a 5 — o acerto chegava **até 600 ms
atrasado**, que é o tempo de um quadro quando a cena 3D está pesada. Medindo a
faixa já posicionada, o ajuste sai junto com a etapa.

## Resultado medido no navegador

Fluxo completo de ida e de volta, `scrollLeft` da faixa e se a aba ativa cabe
inteira na área visível:

| etapa | 1280×900 | | 390×844 | |
|---|---|---|---|---|
| | `scrollLeft` | visível | `scrollLeft` | visível |
| 1. Rosto | 0 | sim | 0 | sim |
| 2. Cabelo | 0 | sim | 0 | sim |
| 3. Roupa | 34 | sim | 62 | sim |
| 4. Acessórios | 140 | sim | 168 | sim |
| 5. Ajustes | 200 | sim | 256 | sim |
| 6. Pronto | 200 | sim | 256 | sim |

Idêntico na volta, de 6 até 1. **24 de 24 aferições visíveis**, nas duas
larguras, contra 6 de 24 antes. Clique direto numa aba distante continua
trocando a etapa e deixando a faixa no lugar. Nenhuma medição mostrou rolagem
horizontal na página (`document.scrollWidth` igual à largura da janela), e não
houve um erro de console em nenhuma sessão.

Antes: `03-defeito-stepper.jpg`. Depois: `11-stepper-corrigido-pc.jpg` e
`12-stepper-corrigido-celular.jpg`.

## Testes

`tests/unit/criador-stepper.test.ts`, 9 casos, 9/9. Cinco cobrem a conta pura
(cabe sem rolar · centraliza · não recua da primeira · não passa da última ·
varredura provando que a aba sempre cabe na janela) e quatro cobrem a trilha
(seis abas, uma só acesa · clique distante · ida e volta pelas seis · sem
layout não escreve `NaN`).

`happy-dom` não calcula layout, então o posicionamento em si **não** é testável
ali — ele foi conferido no Chromium, nas duas larguras, e está na tabela acima.

| Bateria | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `vite build` | ✓ 674 ms — JS 262,71 kB gzip (**+0,15**), CSS 10,36 kB (inalterado) |
| Regressão completa | **408 suítes · 1 609 testes · 1 597 ok · 11 pulados · 1 falha** |

A falha segue sendo `coracao-roseiral.test.ts`, timeout preexistente e fora de
escopo.

## Preservação

Conferido no app depois da correção: catálogo **Ela 20·10·7**, catálogo **Ele
13·10·7**, **nenhuma peça exclusiva vazada** nos dois. Geometrias, rosto,
fichas do Panteão, Aérion, saves, sorteio e a trança corrigida não foram
tocados — a mudança é só a posição de rolagem de uma faixa da interface.
