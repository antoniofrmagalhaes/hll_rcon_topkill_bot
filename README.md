<div align="center">
  <h1>HLL RCON TopKill Bot</h1>
  <p>
    Bot Node.js para <strong>CRCON / Hell Let Loose</strong> com discovery de API,
    ranking de abates sob demanda e anúncio automático ao final da partida.
  </p>
  <p>
    <a href="https://github.com/antoniofrmagalhaes/hll_rcon_topkill_bot">
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

Este projeto automatiza um fluxo simples e útil para servidores de Hell Let Loose conectados ao CRCON:

- descobre e valida endpoints da API;
- monitora logs recentes para capturar o comando `!top`;
- envia o ranking de abates em mensagem privada para quem acionou o comando;
- detecta `MATCH ENDED` e publica automaticamente o top da partida;
- evita duplicações com cooldown, memória de eventos e persistência de estado.

<table>
  <tr>
    <td><strong>Objetivo</strong></td>
    <td>Transformar eventos do CRCON em respostas automáticas com baixo custo operacional.</td>
  </tr>
  <tr>
    <td><strong>Modelo de execução</strong></td>
    <td>Worker Node.js com polling contínuo dos logs do servidor.</td>
  </tr>
  <tr>
    <td><strong>Estado local</strong></td>
    <td>Arquivos em <code>artifacts/</code> para lock de processo e deduplicação de fim de partida.</td>
  </tr>
  <tr>
    <td><strong>Fonte principal de ranking</strong></td>
    <td><code>get_live_game_stats</code>, com fallback quando necessário.</td>
  </tr>
</table>

## Principais Capacidades

<details open>
  <summary><strong>Comando <code>!top</code> no chat</strong></summary>

- lê logs recentes via `get_recent_logs`;
- identifica mensagens de chat com `!top`;
- calcula os melhores jogadores por abates;
- responde por mensagem privada ao jogador que enviou o comando.

</details>

<details open>
  <summary><strong>Anúncio automático em <code>MATCH ENDED</code></strong></summary>

- detecta eventos de fim de partida no mesmo ciclo de polling;
- monta o ranking da partida;
- publica o top para o servidor;
- evita republicação indevida após restart usando estado persistido.

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
  ├─ message_player
  └─ message_all_players
        │
        ▼
src/bot.js
  ├─ polling de logs
  ├─ detecção de !top
  ├─ detecção de MATCH ENDED
  ├─ cooldown / deduplicação
  └─ persistência de estado
        │
        ├─ src/rconClient.js
        ├─ src/top.js
        └─ src/config.js
```

### Decisões de implementação

- O bot faz `1` request de logs por ciclo de polling.
- Requests de scoreboard e envio de mensagens só acontecem quando há evento relevante.
- O ranking ordena por `kills`, depois `kd`, depois menor número de mortes e por fim nome.
- O processo usa arquivo de lock para impedir múltiplas instâncias respondendo ao mesmo tempo.

## Estrutura do Projeto

```text
.
├── .env.example
├── .gitignore
├── README.md
├── get_api_documentation.json
├── instructions.md
├── package.json
├── src
│   ├── bot.js
│   ├── clear.js
│   ├── config.js
│   ├── discover.js
│   ├── rconClient.js
│   └── top.js
└── artifacts
    ├── api-docs.json
    ├── bot-state.json
    └── bot.lock
```

### Responsabilidade dos módulos

- `src/bot.js`: loop principal, eventos, cooldown, estado e lock de processo.
- `src/discover.js`: discovery dos endpoints disponíveis na API.
- `src/rconClient.js`: cliente HTTP com autenticação Bearer e logging resumido.
- `src/top.js`: normalização, cálculo e formatação do ranking.
- `src/config.js`: leitura e validação das variáveis de ambiente.
- `src/clear.js`: encerramento/limpeza operacional do bot.

## Requisitos

- Node.js `18+`
- acesso à API do CRCON
- token com permissões compatíveis com:
  - `get_recent_logs`
  - `get_live_game_stats`
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

### Discovery da API

```bash
npm run discover
```

Esse comando ajuda a inspecionar os endpoints retornados pelo CRCON e registrar artefatos locais para referência.

### Iniciar o bot

```bash
npm run bot
```

### Encerrar o processo do bot

```bash
npm run clear
```

### Smoke test manual

1. Preencha `RCON_BASE_URL` e `RCON_API_TOKEN`.
2. Suba o bot com `npm run bot`.
3. No jogo, envie `!top` no chat.
4. Verifique o terminal.
5. Confirme que não houve erro `fetch failed`.

## Fluxo Operacional

### 1. Polling de logs

O processo consulta `get_recent_logs` em intervalo configurável por `BOT_POLL_INTERVAL_MS`.

### 2. Interceptação do comando `!top`

Quando o bot encontra uma mensagem de chat cujo conteúdo é `!top`:

- identifica o jogador emissor;
- impede duplicidade por evento e por cooldown do ator;
- lê os dados de ranking;
- formata a mensagem final;
- envia a resposta via `message_player`.

### 3. Detecção de fim de partida

Quando o bot encontra um evento `MATCH ENDED`:

- deduplica o evento;
- consulta os dados da partida;
- monta o anúncio;
- publica o ranking;
- persiste o identificador do último evento processado.

### 4. Fallback de dados

O ranking usa `get_live_game_stats` por padrão. Se a resposta vier sem `stats`, o processo tenta fallback com `get_live_scoreboard`.

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
| --- | --- | --- | --- |
| `RCON_API_TOKEN` | Sim | - | Token Bearer da API do CRCON. |
| `RCON_BASE_URL` | Sim | - | Base URL do painel/instância CRCON. |
| `BOT_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs. |
| `BOT_LOG_WINDOW` | Não | `120` | Janela de logs recentes consultados por ciclo. |
| `BOT_LOCK_FILE` | Não | `artifacts/bot.lock` | Arquivo usado para lock de processo. |
| `BOT_TOP_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!top`. |
| `BOT_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown para evitar republicações de `MATCH ENDED`. |
| `TOP_LIMIT` | Não | `10` | Quantidade de jogadores exibidos no ranking. |
| `TOP_INCLUDE_HEADER` | Não | `true` | Adiciona ou remove cabeçalho da mensagem formatada. |
| `TOP_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário para coletar dados do ranking. |
| `BOT_DRY_RUN` | Não | `false` | Não envia mensagens reais; apenas loga as ações. |
| `BOT_STATE_FILE` | Não | `artifacts/bot-state.json` | Persistência de estado para deduplicação entre restarts. |

## Deploy em VPS

### Fluxo mínimo

```bash
git clone git@github.com:antoniofrmagalhaes/hll_rcon_topkill_bot.git
cd hll_rcon_topkill_bot
cp .env.example .env
npm install
npm run bot
```

### Recomendação de produção

Para manter o processo persistente, use um supervisor como `pm2` ou `systemd`.

#### Exemplo com PM2

```bash
npm install
pm2 start npm --name hll-topkill-bot -- run bot
pm2 save
```

#### Exemplo de unit com systemd

```ini
[Unit]
Description=HLL RCON TopKill Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hll_rcon_topkill_bot
ExecStart=/usr/bin/npm run bot
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
- `artifacts/api-docs.json`: snapshot de discovery para referência local.

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
