# Política de segurança — EDENWORLD

## Versões com suporte

O EDENWORLD é um jogo de navegador em desenvolvimento, publicado como site
estático. Só a versão mais recente recebe correção: não há ramos de manutenção
nem versões antigas hospedadas.

| Versão | Suporte |
| --- | --- |
| Genesis 0.5 (atual) | ✅ |
| Genesis 0.2 e anteriores | ❌ |

A versão em uso aparece no rodapé do menu principal e na tela **Sobre**.

## Superfície de ataque, honestamente

Vale dizer o que este projeto **não** faz, porque isso define o que pode dar
errado:

- **não há servidor, conta nem back-end.** Nada é enviado para lugar nenhum;
- **não há coleta de dados, telemetria ou análise de uso.** As camadas
  `src/eden-connect/` e `src/social/` são contratos vazios para um futuro
  serviço, e não fazem chamada de rede;
- **não há dependência de conteúdo externo em tempo de execução.** Cenário,
  personagens, som e interface são gerados por código; não se baixa modelo,
  textura nem fonte;
- **o progresso fica no `localStorage` do navegador**, na chave
  `edenworld.save.v1`, e só naquele aparelho.

O que sobra como risco real: o **arquivo de salvamento**, que o jogador pode
exportar e importar. Ele é tratado como entrada não confiável — valores fora
de faixa, posições inválidas e estruturas adulteradas são descartados na
leitura, e há cenário de ponta a ponta (`robustez`) que carrega salvamento
corrompido de propósito. Se você encontrar um salvamento que escape dessa
higienização, é um relato que interessa.

## Como relatar

Abra uma
[**Security advisory**](https://github.com/edenaeroworld-source/EdenWorld/security/advisories/new)
no repositório. É o canal privado do GitHub: o relato não fica visível
enquanto não houver correção.

Se preferir, abra uma issue comum — mas **só** quando o problema não expuser
dados de ninguém, que é o caso da maioria das falhas aqui, já que não há
dados de ninguém a expor.

No relato, ajuda ter: a versão (rodapé do menu), o navegador e o sistema, o
que aconteceu e o passo a passo para reproduzir. Se envolver um salvamento,
anexe o arquivo exportado.

## O que esperar

Este é um projeto conduzido por uma pessoa, sem equipe de plantão. O
compromisso é de esforço, não de prazo contratual:

- **retorno** dizendo que o relato foi lido e se foi aceito ou recusado — e,
  se recusado, por quê;
- **correção** publicada na versão seguinte, ou antes dela se o problema for
  sério;
- **crédito** a quem relatou, na nota da versão, salvo se preferir o anonimato.

## Fora de escopo

- Recursos marcados como **"em breve"** (Éden Connect, EdenStore, EdenTV,
  EdenGame, EdenPawl, eventos com data). Eles não têm implementação: não há o
  que explorar;
- ausência de multijogador, de conta ou de criptografia em trânsito — não há
  trânsito;
- o fato de o salvamento ser legível e editável pelo próprio jogador no
  navegador dele. Isso é esperado: o jogo é local e de um jogador só, e nada
  no jogo depende de o salvamento ser secreto.
