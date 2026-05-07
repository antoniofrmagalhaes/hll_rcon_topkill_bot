<div align="center">
  <h1>HLL Bots</h1>
  <p>
    Bots Node.js para <strong>CRCON / Hell Let Loose</strong> com comandos de chat,
    eventos de partida, rankings, premiações por performance e rotinas operacionais.
  </p>
  <p>
    <a href="https://github.com/antoniofrmagalhaes/hll-bots">
      <img src="https://img.shields.io/badge/repository-github-black?style=for-the-badge&logo=github" alt="GitHub repository" />
    </a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-43853d?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 18+" />
    <img src="https://img.shields.io/badge/runtime-bot-0f766e?style=for-the-badge" alt="Bot runtime" />
    <img src="https://img.shields.io/badge/status-production%20ready-1d4ed8?style=for-the-badge" alt="Production ready" />
  </p>
</div>

<br />

## Sumário

- [Visão Geral](#visão-geral)
- [Principais Capacidades](#principais-capacidades)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Requisitos](#requisitos)
- [Configuração](#configuração)
- [Executando Localmente](#executando-localmente)
- [Fluxo Operacional](#fluxo-operacional)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Deploy em VPS](#deploy-em-vps)
- [Operação e Manutenção](#operação-e-manutenção)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

## Visão Geral

Este projeto organiza uma suíte de bots para servidores de Hell Let Loose conectados ao CRCON:

- descobre e valida endpoints da API;
- monitora logs recentes para capturar os comandos `!top`, `!nodos`, `!perf` e `!performance`;
- envia o ranking de abates em mensagem privada para quem acionou o comando;
- detecta `MATCH ENDED` e publica automaticamente o top da partida;
- detecta `MATCH ENDED` no bot de performance, publica os vencedores e concede VIP de 1 dia;
- evita duplicações com cooldown, memória de eventos e persistência de estado.

<table>
  <tr>
    <td><strong>Objetivo</strong></td>
    <td>Transformar eventos do CRCON em automações modulares com baixo custo operacional.</td>
  </tr>
  <tr>
    <td><strong>Modelo de execução</strong></td>
    <td>Runner Node.js que sobe bots independentes com polling contínuo dos logs do servidor.</td>
  </tr>
  <tr>
    <td><strong>Estado local</strong></td>
    <td>Arquivos em <code>artifacts/</code> para lock de processo e deduplicação de fim de partida.</td>
  </tr>
  <tr>
    <td><strong>Fonte principal de ranking</strong></td>
    <td><code>get_live_game_stats</code>, com fallback quando necessário.</td>
  </tr>
  <tr>
    <td><strong>Bots atuais</strong></td>
    <td><code>top</code>, <code>nodos</code>, <code>performance</code> e <code>performance-info</code>.</td>
  </tr>
</table>

## Principais Capacidades

<details open>
  <summary><strong>Top Bot: comando <code>!top</code> no chat</strong></summary>

- lê logs recentes via `get_recent_logs`;
- identifica mensagens de chat com `!top`;
- calcula os melhores jogadores por abates;
- responde por mensagem privada ao jogador que enviou o comando.

</details>

<details open>
  <summary><strong>Top Bot: anúncio automático em <code>MATCH ENDED</code></strong></summary>

- detecta eventos de fim de partida no mesmo ciclo de polling;
- monta o ranking da partida;
- publica o top para o servidor;
- evita republicação indevida após restart usando estado persistido.

</details>

<details open>
  <summary><strong>Nodos: comando <code>!nodos</code> no chat</strong></summary>

- permite uso pelo comandante do time ou pelo `ADMINISTRADOR_ID`;
- identifica oficiais e engenheiros do mesmo time via `get_team_view`;
- envia lembrete privado para oficiais cobrarem engenheiros;
- envia lembrete privado para engenheiros construirem nodos na base/ultimo ponto.

</details>

<details open>
  <summary><strong>Performance Bot: performance e VIP no fim da partida</strong></summary>

- calcula melhor comandante, top 3 jogadores da partida e melhor squad de tanque;
- publica o resultado da performance no chat geral;
- concede VIP de 1 dia com `add_vip` para vencedores sem VIP;
- envia mensagem privada para cada vencedor premiado;
- consulta VIPs atuais para evitar acúmulo;
- persiste estado próprio para não processar o mesmo `MATCH ENDED` duas vezes.

</details>

<details open>
  <summary><strong>Performance Info Bot: comando <code>!perf</code> / <code>!performance</code></strong></summary>

- responde por mensagem privada;
- explica categorias, critérios de pontuação e premiação;
- ajuda jogadores a entender como buscar VIP por performance.

</details>

<details>
  <summary><strong>Proteções operacionais</strong></summary>

- lock de instância para impedir dois processos concorrentes;
- cooldown por jogador para reduzir spam do `!top`;
- deduplicação de eventos de chat e de `MATCH ENDED`;
- modo `dry-run` para validar comportamento sem enviar mensagens reais.

</details>

## Arquitetura

```text
CRCON API
  ├─ get_recent_logs
  ├─ get_live_game_stats
  ├─ get_live_scoreboard
  ├─ get_team_view
  ├─ get_vip_ids
  ├─ add_vip
  ├─ message_player
  └─ message_all_players
        │
        ▼
src/runBots.js
  ├─ src/bot.js
  │   ├─ detecção de !top
  │   └─ anúncio de top kill em MATCH ENDED
  ├─ src/performanceInfoBot.js
  │   └─ detecção de !perf / !performance
  └─ src/performanceBot.js
      ├─ performance em MATCH ENDED
      ├─ concessão de VIP
      └─ mensagens públicas/privadas
        │
        ├─ src/rconClient.js
        ├─ src/top.js
        ├─ src/performance.js
        └─ src/config.js
```

### Decisões de implementação

- Cada bot faz `1` request de logs por ciclo de polling.
- Requests de scoreboard e envio de mensagens só acontecem quando há evento relevante.
- O ranking ordena por `kills`, depois `kd`, depois menor número de mortes e por fim nome.
- O bot de performance tem estado próprio para processar cada `MATCH ENDED` uma única vez.
- Cada processo usa arquivo de lock para impedir múltiplas instâncias respondendo ao mesmo tempo.

## Estrutura do Projeto

```text
.
├── .env.example
├── .gitignore
├── README.md
├── docs
│   ├── incidents
│   │   └── 2026-05-07-performance-vip-expiration.md
│   └── plans
│       └── top-performance-vip-bots.md
├── get_api_documentation.json
├── instructions.md
├── package.json
├── src
│   ├── bot.js
│   ├── clear.js
│   ├── config.js
│   ├── discover.js
│   ├── performance.js
│   ├── performanceBot.js
│   ├── performanceInfoBot.js
│   ├── rconClient.js
│   ├── runBots.js
│   └── top.js
└── artifacts
    ├── api-docs.json
    ├── bot-state.json
    ├── performance-bot-state.json
    ├── performance-info-bot.lock
    ├── performance-bot.lock
    └── bot.lock
```

### Responsabilidade dos módulos

- `src/bot.js`: bot de top kill, eventos `!top`/`MATCH ENDED`, cooldown, estado e lock de processo.
- `src/discover.js`: discovery dos endpoints disponíveis na API.
- `src/performance.js`: cálculo e formatação dos vencedores de performance.
- `src/performanceBot.js`: bot de produção para performance/VIP no fim da partida.
- `src/performanceInfoBot.js`: bot informativo para `!perf` e `!performance`.
- `src/rconClient.js`: cliente HTTP com autenticação Bearer e logging resumido.
- `src/runBots.js`: runner local/produção para subir os bots juntos.
- `src/top.js`: normalização, cálculo e formatação do ranking.
- `src/config.js`: leitura e validação das variáveis de ambiente.
- `src/clear.js`: encerramento/limpeza operacional do bot.

### Documentos operacionais

- `docs/incidents/`: registros de incidentes, correções manuais e auditorias de produção.
- `docs/plans/`: planos de implementação e decisões de produto/arquitetura.

## Requisitos

- Node.js `18+`
- acesso à API do CRCON
- token com permissões compatíveis com:
  - `get_recent_logs`
  - `get_live_game_stats`
  - `get_team_view`
  - `get_vip_ids`
  - `add_vip`
  - `message_all_players`
  - `message_player`

## Configuração

1. Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

2. Ajuste as variáveis obrigatórias:

```env
RCON_API_TOKEN=seu_token_aqui
RCON_BASE_URL=https://seu-crcon.exemplo.com.br
```

3. Revise os parâmetros operacionais opcionais de acordo com o perfil do servidor.

## Executando Localmente

### Instalação

```bash
npm install
```

### Scripts disponíveis

| Script | Uso |
| --- | --- |
| `npm run discover` | Consulta a documentação exposta pelo CRCON e salva referência local. |
| `npm run bot` | Sobe apenas o Top Bot. |
| `npm run bots` | Sobe o runner com todos os bots habilitados por ambiente. |
| `npm run performance` | Sobe apenas o Performance Bot. |
| `npm run performance:info` | Sobe apenas o Performance Info Bot. |
| `npm run stop` | Encerra processos conhecidos e remove locks operacionais. |
| `npm run clear` | Encerra processos conhecidos e remove locks operacionais. |

### Discovery da API

```bash
npm run discover
```

Esse comando ajuda a inspecionar os endpoints retornados pelo CRCON e registrar artefatos locais para referência.

### Iniciar apenas o Top Bot

```bash
npm run bot
```

### Iniciar todos os bots

```bash
npm run bots
```

Esse comando sobe o Top Bot, o Performance Info Bot e, quando `PERFORMANCE_BOT_ENABLED=true`, o Performance Bot.

### Encerrar processos e limpar locks

```bash
npm run stop
```

### Smoke test manual

1. Preencha `RCON_BASE_URL` e `RCON_API_TOKEN`.
2. Suba os bots com `npm run bots`.
3. No jogo, envie `!top` no chat.
4. Envie `!perf` ou `!performance` para validar a mensagem informativa.
5. Verifique o terminal.
6. Confirme que não houve erro `fetch failed`.

## Fluxo Operacional

### 1. Runner dos bots

O `src/runBots.js` inicia cada bot habilitado por variável de ambiente:

- `TOP_BOT_ENABLED=true`: sobe o Top Bot.
- `PERFORMANCE_INFO_BOT_ENABLED=true`: sobe o Performance Info Bot.
- `PERFORMANCE_BOT_ENABLED=true`: sobe o Performance Bot.

Se qualquer processo filho encerrar inesperadamente, o runner encerra o conjunto para o supervisor (`systemd`, `pm2` ou similar) reiniciar de forma limpa.

### 2. Polling de logs

Cada bot consulta `get_recent_logs` em intervalo configurável pela família de variáveis correspondente.

### 3. Interceptação do comando `!top`

Quando o bot encontra uma mensagem de chat cujo conteúdo é `!top`:

- identifica o jogador emissor;
- impede duplicidade por evento e por cooldown do ator;
- lê os dados de ranking;
- formata a mensagem final;
- envia a resposta via `message_player`.

### 4. Detecção de fim de partida no Top Bot

Quando o bot encontra um evento `MATCH ENDED`:

- deduplica o evento;
- consulta os dados da partida;
- monta o anúncio;
- publica o ranking;
- persiste o identificador do último evento processado.

### 5. Comando `!nodos`

Quando o Top Bot encontra `!nodos`:

- consulta `get_team_view`;
- valida se o emissor tem papel de comandante do time ou corresponde ao `ADMINISTRADOR_ID`;
- localiza oficiais e engenheiros do mesmo time;
- envia mensagens privadas para esses jogadores pedindo construcao de nodos.

### 6. Performance e VIP

Quando o bot de performance encontra `MATCH ENDED`:

- deduplica o evento por memória, cooldown e arquivo de estado;
- consulta `get_live_game_stats`, `get_team_view` e `get_vip_ids`;
- calcula melhor comandante, top 3 jogadores da partida e melhor squad de tanque;
- envia o anúncio público de performance;
- chama `add_vip` para vencedores sem VIP;
- envia mensagem privada para cada vencedor premiado.

Os comandos administrativos `!p` e `!t` ficam desativados por padrão. Para testes locais, configure `ENABLE_TEST_COMMANDS=true` e `ADMINISTRADOR_ID`; nesse modo, só o jogador com esse SteamID pode executar os comandos e todas as prévias são enviadas por mensagem privada para o próprio administrador.

### 7. Fallback de dados

O ranking usa `get_live_game_stats` por padrão. Se a resposta vier sem `stats`, o processo tenta fallback com `get_live_scoreboard`.

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
| --- | --- | --- | --- |
| `RCON_API_TOKEN` | Sim | - | Token Bearer da API do CRCON. |
| `RCON_BASE_URL` | Sim | - | Base URL do painel/instância CRCON. |
| `BOT_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Top Bot. |
| `BOT_LOG_WINDOW` | Não | `120` | Janela de logs recentes consultados por ciclo no Top Bot. |
| `BOT_LOCK_FILE` | Não | `artifacts/bot.lock` | Arquivo usado para lock do Top Bot. |
| `BOT_TOP_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!top`. |
| `BOT_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown para evitar republicações de `MATCH ENDED` pelo Top Bot. |
| `TOP_LIMIT` | Não | `10` | Quantidade de jogadores exibidos no ranking. |
| `TOP_INCLUDE_HEADER` | Não | `true` | Adiciona ou remove cabeçalho da mensagem formatada. |
| `TOP_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário para coletar dados do ranking. |
| `BOT_DRY_RUN` | Não | `false` | Não envia mensagens reais; apenas loga as ações. |
| `BOT_STATE_FILE` | Não | `artifacts/bot-state.json` | Persistência de estado para deduplicação entre restarts. |
| `TOP_BOT_ENABLED` | Não | `true` | Ativa o bot de `!top` no runner `npm run bots`. |
| `PERFORMANCE_INFO_BOT_ENABLED` | Não | `true` | Ativa o bot informativo `!perf`/`!performance`. |
| `PERFORMANCE_BOT_ENABLED` | Não | `false` | Ativa o bot de performance/VIP no runner. |
| `ENABLE_TEST_COMMANDS` | Não | `false` | Ativa comandos administrativos de preview, como `!p` e `!t`. |
| `ADMINISTRADOR_ID` | Para comandos administrativos | - | SteamID autorizado a executar comandos administrativos e receber as prévias por privado. Tambem pode acionar `!nodos` sem ser comandante, se estiver em um time. |
| `PERFORMANCE_INFO_DRY_RUN` | Não | `false` | Não envia respostas reais do Performance Info Bot; apenas loga as ações. |
| `PERFORMANCE_INFO_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Performance Info Bot. |
| `PERFORMANCE_INFO_LOG_WINDOW` | Não | `120` | Janela de logs recentes do Performance Info Bot. |
| `PERFORMANCE_INFO_LOCK_FILE` | Não | `artifacts/performance-info-bot.lock` | Arquivo de lock do Performance Info Bot. |
| `PERFORMANCE_INFO_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!perf`/`!performance`. |
| `PERFORMANCE_SEND_PUBLIC` | Não | `true` | Envia anúncio público de performance no `MATCH ENDED`. |
| `PERFORMANCE_SEND_WINNER_PRIVATE` | Não | `true` | Envia mensagem privada para vencedores premiados. |
| `PERFORMANCE_GRANT_VIP` | Não | `true` | Chama `add_vip` para vencedores sem VIP. |
| `PERFORMANCE_VIP_EXPIRATION` | Não | `1 day` | Duracao relativa (`1 day`, `24 hours`, `90 minutes`) ou data ISO; o bot converte para timestamp absoluto antes do `add_vip`. |
| `PERFORMANCE_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Performance Bot. |
| `PERFORMANCE_LOG_WINDOW` | Não | `120` | Janela de logs recentes do Performance Bot. |
| `PERFORMANCE_LOCK_FILE` | Não | `artifacts/performance-bot.lock` | Arquivo de lock do Performance Bot. |
| `PERFORMANCE_STATE_FILE` | Não | `artifacts/performance-bot-state.json` | Persistência de estado do bot de performance. |
| `PERFORMANCE_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown de `MATCH ENDED` do bot de performance. |
| `PERFORMANCE_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário para coleta dos dados de performance. |

## Deploy em VPS

### Fluxo mínimo

```bash
git clone git@github.com:antoniofrmagalhaes/hll-bots.git
cd hll-bots
cp .env.example .env
npm install
npm run bots
```

### Recomendação de produção

Para manter o processo persistente, use um supervisor como `pm2` ou `systemd`.

#### Exemplo com PM2

```bash
npm install
pm2 start npm --name hll-bots -- run bots
pm2 save
```

#### Exemplo de unit com systemd

```ini
[Unit]
Description=HLL Bots
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hll-bots
ExecStart=/usr/bin/npm run bots
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Operação e Manutenção

### Artefatos gerados em runtime

- `artifacts/bot.lock`: impede mais de uma instância rodando ao mesmo tempo.
- `artifacts/bot-state.json`: persiste o último `MATCH ENDED` processado.
- `artifacts/performance-bot.lock`: lock do bot de performance.
- `artifacts/performance-bot-state.json`: persiste o último `MATCH ENDED` processado pelo bot de performance.
- `artifacts/api-docs.json`: snapshot de discovery para referência local.

### Incidentes e auditoria

- `docs/incidents/2026-05-07-performance-vip-expiration.md`: registro dos VIPs permanentes criados pelo bug de expiração do bot de performance, remoção dos registros incorretos e concessão correta de 1 dia.

### Boas práticas

- não versione `.env`;
- mantenha `BOT_DRY_RUN=true` ao validar em ambiente novo;
- revise permissões do token antes de diagnosticar erro de endpoint;
- monitore logs do processo para identificar timeouts ou retornos `failed=true`.

## Troubleshooting

### `Missing required env var`

Confira se `RCON_API_TOKEN` e `RCON_BASE_URL` existem no `.env` e estão preenchidos.

### `fetch failed`

- valide conectividade da VPS até o CRCON;
- confirme DNS, firewall e TLS;
- teste a base URL manualmente com `curl`.

### O bot não responde ao `!top`

- confirme se os logs de chat chegam em `get_recent_logs`;
- verifique se o conteúdo da mensagem está chegando como `!top`;
- revise se o usuário caiu no cooldown configurado.

### O anúncio de fim de partida não saiu

- confira se o evento realmente apareceu nos logs;
- valide `BOT_MATCH_ENDED_COOLDOWN_MS`;
- inspecione o arquivo de estado em `artifacts/bot-state.json`.

### Duas instâncias parecem estar rodando

Verifique o arquivo de lock em `artifacts/bot.lock` e o supervisor de processos da máquina.

## Roadmap

- persistir estado em Redis para deduplicação mais forte;
- expor endpoint interno de healthcheck;
- melhorar observabilidade e métricas;
- avaliar empacotamento em container;
- considerar exposição do fluxo como MCP server.

---

<div align="center">
  <sub>Construído para operação simples, baixa fricção de deploy e comportamento previsível em produção.</sub>
</div>
