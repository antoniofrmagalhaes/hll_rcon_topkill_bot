Segue um prompt pronto para colar no Codex:

````md
Você vai atuar como um engenheiro sênior de backend e tooling.

Contexto do projeto:
- Estamos trabalhando com o projeto CRCON / HLL RCON Tool.
- Já existe uma instância rodando e já temos uma API key válida.
- No servidor já existem chat commands internos como `!r`, que seguem o padrão nativo do CRCON para acionar comandos administrativos pelo chat.
- Antes de implementar novos comandos nativos no core do CRCON, queremos criar um projeto de **discovery** em **Node.js** para explorar a API, mapear endpoints disponíveis, testar fluxos, validar payloads e provar a lógica de comandos.
- Depois, se fizer mais sentido, a implementação final poderá ser portada para Python ou integrada ao core do CRCON.

Objetivo:
Criar um projeto Node.js enxuto, organizado e pronto para discovery da API do CRCON, com foco em:
1. autenticação por Bearer token
2. descoberta automática dos endpoints disponíveis
3. execução manual de chamadas de teste
4. criação de uma camada de cliente reutilizável
5. preparação para futura exposição via MCP
6. base para testar a lógica de comandos como `!top`

Importante:
- Não quero um projeto gigante nem overengineered.
- Quero uma base pragmática, limpa e extensível.
- Use **Node.js + TypeScript**.
- Prefira código simples, tipado, legível e modular.
- Não invente endpoints que não existam. Sempre trate a descoberta de endpoints a partir da documentação exposta pela API.
- O projeto deve ser orientado a discovery, observabilidade e testes exploratórios.
- Sempre que um endpoint ou payload for incerto, o código deve deixar isso explícito e facilitar inspeção.
- Não implemente nada dependente de navegador ou automação de interface. Toda integração deve ser via HTTP/API.
- Não faça suposições frágeis sobre o schema de retorno sem deixar isso isolado em tipos/adapters.

Entregáveis esperados:
1. Estrutura de pastas do projeto
2. `package.json`
3. `tsconfig.json`
4. variáveis de ambiente com `.env.example`
5. cliente HTTP tipado para CRCON
6. módulo de discovery da API
7. scripts CLI para executar testes rápidos
8. utilitários de logging
9. exemplos de uso
10. README com instruções de setup e uso
11. sugestão de próximos passos para evoluir para MCP
12. tudo já com código inicial funcional

Stack desejada:
- Node.js
- TypeScript
- `tsx` para rodar em dev
- `zod` para validação/runtime parsing
- `dotenv` para env
- `undici` ou `axios` para HTTP, escolha a opção mais simples e robusta
- `pino` para logging, se ajudar
- sem frameworks pesados
- sem banco por enquanto

O que esse projeto deve fazer:

## 1. Discovery da API
Criar um comando CLI como:
- `npm run discover`

Esse comando deve:
- chamar o endpoint de documentação da API do CRCON
- salvar a resposta bruta em disco, por exemplo em `artifacts/api-docs.json`
- gerar uma visão resumida em terminal
- listar endpoints detectados
- tentar identificar:
  - endpoints GET
  - endpoints POST
  - nomes de comandos úteis
  - endpoints relacionados a gamestate
  - endpoints relacionados a players
  - endpoints relacionados a logs/chat
  - endpoints relacionados a message/punish/admin actions

Também deve existir uma função utilitária que permita buscar endpoints por palavra-chave, por exemplo:
- `players`
- `logs`
- `chat`
- `message`
- `punish`
- `game`
- `stats`

## 2. Cliente base da API
Criar uma classe ou módulo `CrconClient` com:
- `get(path)`
- `post(path, payload)`
- tratamento de erro
- timeout
- headers padrão
- bearer token
- logs mínimos úteis
- possibilidade de dump da resposta bruta para debug

Esse cliente deve ser a base para todos os outros módulos.

## 3. Scripts de exploração
Criar scripts CLI como:
- `npm run discover`
- `npm run test:gamestate`
- `npm run test:players`
- `npm run test:logs`
- `npm run test:message`

Esses scripts devem:
- usar o `CrconClient`
- usar o resultado do discovery quando útil
- falhar de forma explícita e informativa
- imprimir payloads e respostas de forma organizada

## 4. Modo de inspeção flexível
Criar também um script genérico como:
- `npm run call -- get_gamestate`
- `npm run call -- do_message_player --data '{"player":"X","steam_id_64":"Y","message":"teste"}'`

Esse script deve:
- aceitar nome do endpoint
- aceitar método opcional
- aceitar payload JSON
- exibir request e response
- facilitar exploração manual sem editar código

## 5. Preparação para lógica de !top
Ainda não implementar a feature final do chat command nativo.
Mas criar uma base para discovery da lógica do `!top`:
- identificar quais endpoints podem fornecer dados da partida atual
- identificar possíveis fontes de stats por jogador
- testar quais responses trazem kills, deaths, score, combat, offense, defense, support ou campos similares
- criar um módulo provisório `top-players-discovery.ts` que:
  - consulta possíveis endpoints relevantes
  - loga schemas observados
  - tenta normalizar jogadores em uma estrutura comum
  - ordena por uma métrica configurável
  - imprime um top 5 no terminal
- tudo isso deve ser tratado como discovery/prototipagem, não como feature final de produção

## 6. Estrutura sugerida
Quero algo próximo disto:

```txt
crcon-discovery/
  src/
    cli/
      discover.ts
      call.ts
      test-gamestate.ts
      test-players.ts
      test-logs.ts
      test-message.ts
      top-players-discovery.ts
    core/
      config.ts
      logger.ts
      errors.ts
    crcon/
      client.ts
      discovery.ts
      endpoint-catalog.ts
      adapters/
        api-docs.adapter.ts
        players.adapter.ts
        logs.adapter.ts
        gamestate.adapter.ts
    utils/
      pretty.ts
      json.ts
      files.ts
  artifacts/
  .env.example
  package.json
  tsconfig.json
  README.md
````

Você pode melhorar essa estrutura, mas sem complicar demais.

## 7. Variáveis de ambiente

Quero `.env.example` com algo assim:

* `CRCON_BASE_URL=http://127.0.0.1:8010/api`
* `CRCON_API_KEY=`
* `CRCON_TIMEOUT_MS=20000`
* `CRCON_DEBUG=true`

## 8. Qualidade de código

Exigências:

* TypeScript bem tipado
* funções pequenas
* comentários só onde realmente ajudam
* tratamento explícito de erros
* mensagens de log úteis
* evitar acoplamento desnecessário
* separar descoberta, transporte HTTP e adaptação de schema
* não esconder incertezas: quando um schema for parcialmente desconhecido, deixar isso claro no tipo e no código

## 9. README

Escrever um README objetivo contendo:

* propósito do projeto
* setup
* instalação
* configuração do `.env`
* como rodar discovery
* como testar endpoints
* como usar o comando genérico de call
* como usar o módulo de top players discovery
* quais partes ainda são exploratórias
* próximos passos para evoluir para:

  1. um MCP server em Node.js
  2. uma implementação Python
  3. integração com comandos internos do CRCON

## 10. Próxima fase

Além do projeto, quero no final uma seção chamada:
`Possível evolução para MCP`
Mostre como esse projeto poderia evoluir depois para:

* expor tools MCP
* reaproveitar `CrconClient`
* transformar discovery em tools reais
* manter a lógica de negócio separada da camada MCP

## Forma de resposta

Quero que você:

1. gere a estrutura completa do projeto
2. escreva os arquivos principais com código real
3. inclua conteúdo de README
4. explique rapidamente as decisões arquiteturais
5. aponte trechos marcados como discovery/provisórios
6. não pare na metade
7. entregue algo inicial já coerente e executável

Capriche principalmente em:

* design do `CrconClient`
* módulo de discovery
* comando CLI genérico
* base para investigar `!top`

Não implemente nada dependente de UI web.
Não crie código fake demais.
Quando algo depender do formato real retornado pela API, trate isso como discovery e deixe instrumentado para inspeção.

```
```
