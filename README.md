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
- monitora logs recentes para capturar os comandos `!top`, `!op`, `!n`, `!nodos`, `!perf`, `!performance` e previews admin como `!tp`;
- envia o ranking de abates em mensagem privada para quem acionou o comando;
- envia lembrete privado de OP para o oficial do squad quando o comando `!op` passa nas regras de tag;
- detecta `MATCH ENDED` e publica automaticamente o top da partida;
- detecta `MATCH ENDED` no bot de performance, publica quem bateu a meta da classe final e concede VIP de 1 dia;
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
    <td><code>top</code>, <code>op</code>, <code>nodos</code>, <code>performance</code> e <code>performance-info</code>.</td>
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
  <summary><strong>OP Bot: comando <code>!op</code> no chat</strong></summary>

- valida se o emissor usa prefixo `≫ ` ou `»BAIN« `;
- consulta `get_team_view` para localizar o squad do emissor;
- identifica o oficial do mesmo squad;
- exige que o oficial também use um dos prefixos aceitos;
- envia mensagem privada para o oficial cobrando OP.

</details>

<details open>
  <summary><strong>Nodos: comando <code>!n</code> / <code>!nodos</code> no chat</strong></summary>

- permite uso pelo comandante do time ou pelo `ADMINISTRADOR_ID`;
- identifica oficiais e engenheiros do mesmo time via `get_team_view`;
- envia lembrete privado para oficiais cobrarem engenheiros;
- envia lembrete privado para engenheiros construirem nodos na base/ultimo ponto.

</details>

<details open>
  <summary><strong>Performance Bot: performance e VIP no fim da partida</strong></summary>

- calcula a performance por classe final usando abates, combate, ataque, defesa e suporte;
- publica o resultado da performance no chat geral;
- concede VIP de 1 dia com `add_vip` para jogadores sem VIP que bateram a meta da classe;
- envia mensagem privada para cada vencedor premiado;
- possui comandos administrativos privados para prévia, ajuda e métricas por classe;
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
  │   ├─ preview administrativo !t
  │   ├─ lembrete de OP !op
  │   ├─ lembrete de nodos !n / !nodos
  │   └─ anúncio de top kill em MATCH ENDED
  ├─ src/performanceInfoBot.js
  │   └─ detecção de !perf / !performance
  └─ src/performanceBot.js
      ├─ preview administrativo !tp
      ├─ performance em MATCH ENDED
      ├─ concessão de VIP
      └─ mensagens públicas/privadas
        │
        ├─ src/adminCommands.js
        ├─ src/nodos.js
        ├─ src/op.js
        ├─ src/rconClient.js
        ├─ src/top.js
        ├─ src/performance.js
        └─ src/config.js
```

### Decisões de implementação

- Cada bot faz `1` request de logs por ciclo de polling.
- Requests de scoreboard e envio de mensagens só acontecem quando há evento relevante.
- O ranking ordena por `kills`, depois `kd`, depois menor número de mortes e por fim nome.
- Comandos administrativos de preview dependem de `ENABLE_TEST_COMMANDS=true` e `ADMINISTRADOR_ID`.
- `!tp` e `!t` sempre redirecionam a prévia por privado para o administrador, sem publicar no servidor.
- `!op` é operacional: emissor e oficial do squad precisam usar prefixo de clã aceito.
- `!n`/`!nodos` é operacional: comandante do time pode acionar; o administrador também pode acionar se estiver em um time.
- O bot de performance tem estado próprio para processar cada `MATCH ENDED` uma única vez.
- Cada processo usa arquivo de lock para impedir múltiplas instâncias respondendo ao mesmo tempo.

## Estrutura do Projeto

```text
.
├── .env.example
├── .gitignore
├── README.md
├── deploy
│   ├── install-pm2.sh
│   └── install-systemd.sh
├── docs
│   ├── incidents
│   │   ├── 2026-05-21-main-discovery-branch-consolidation.md
│   │   └── 2026-05-07-performance-vip-expiration.md
│   └── plans
│       └── top-performance-vip-bots.md
├── get_api_documentation.json
├── instructions.md
├── package.json
├── src
│   ├── adminCommands.js
│   ├── bot.js
│   ├── clear.js
│   ├── config.js
│   ├── discover.js
│   ├── nodos.js
│   ├── op.js
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

- `src/adminCommands.js`: helpers compartilhados para comandos administrativos, validação de `ADMINISTRADOR_ID` e envio privado.
- `src/bot.js`: bot de top kill, eventos `!top`/`!t`/`!op`/`!n`/`!nodos`/`MATCH ENDED`, cooldown, estado e lock de processo.
- `src/discover.js`: discovery dos endpoints disponíveis na API.
- `src/nodos.js`: valida comandante/admin, localiza oficiais/engenheiros no `get_team_view` e envia lembretes privados de nodos.
- `src/op.js`: valida tags de clã, localiza o oficial do squad via `get_team_view` e envia lembrete privado de OP.
- `src/performance.js`: cálculo e formatação das metas de performance por classe.
- `src/performanceBot.js`: bot de produção para performance/VIP no fim da partida e preview administrativo `!tp`.
- `src/performanceInfoBot.js`: bot informativo para `!perf` e `!performance`.
- `src/rconClient.js`: cliente HTTP com autenticação Bearer e logging resumido.
- `src/runBots.js`: runner local/produção para subir os bots juntos.
- `src/top.js`: normalização, cálculo e formatação do ranking.
- `src/config.js`: leitura e validação das variáveis de ambiente.
- `src/clear.js`: encerramento/limpeza operacional do bot.

### Documentos operacionais

- `docs/incidents/`: registros de incidentes, correções manuais e auditorias de produção.
- `docs/plans/`: planos de implementação e decisões de produto/arquitetura.

### Branch operacional

- `main` é a branch única para desenvolvimento, deploy e produção.
- A antiga branch Git `discovery` foi consolidada em `main` em `2026-05-21` e removida depois da migração da VPS.
- Neste repositório, o termo `discovery` que ainda aparece em scripts e documentos se refere à inspeção da API do CRCON, não a uma branch Git.

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
| `npm run service:start` | Inicia o serviço `systemd` configurado em `SERVICE_NAME` ou `hll-top-bot`. |
| `npm run service:restart` | Reinicia o serviço `systemd` configurado em `SERVICE_NAME` ou `hll-top-bot`. |
| `npm run service:refresh` | Executa `git pull --ff-only`, instala dependências e reinicia o serviço. |
| `npm run service:stop` | Para o serviço `systemd` configurado em `SERVICE_NAME` ou `hll-top-bot`. |
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
5. Se for testar previews administrativos, configure `ENABLE_TEST_COMMANDS=true` e confira se `ADMINISTRADOR_ID` é o ID real do jogador no servidor.
6. Envie `!t` para receber a prévia do top abates por privado.
7. Envie `!tp` para receber a prévia de performance por privado.
8. Envie `!op` como jogador com tag em um squad cujo oficial tambem tenha tag para validar o lembrete privado de OP.
9. Envie `!n` ou `!nodos` como comandante, ou como administrador em um time, para validar os lembretes privados de nodos.
10. Verifique o terminal.
11. Confirme que não houve erro `fetch failed`.

## Fluxo Operacional

### 1. Runner dos bots

O `src/runBots.js` inicia cada bot habilitado por variável de ambiente:

- `TOP_BOT_ENABLED=true`: sobe o Top Bot.
- `OP_BOT_ENABLED=true`: deixa o comando `!op` ativo dentro do Top Bot.
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

### 5. Comando `!op`

Quando o Top Bot encontra `!op`:

- valida se o emissor comeca com `≫ ` ou `»BAIN« `;
- consulta `get_team_view`;
- localiza o oficial do mesmo squad;
- valida se o oficial tambem comeca com `≫ ` ou `»BAIN« `;
- envia PM para o oficial com `MENSAGEM DO PELOTÃO` e `CADE O OP PORRA?!`.

O comando `!op` nao verifica o estado real do outpost, porque o fluxo atual nao tem endpoint/log confiavel para isso. Em `BOT_DRY_RUN=true`, nenhuma PM real e enviada.

### 6. Comando `!n` / `!nodos`

Quando o Top Bot encontra `!n` ou `!nodos`:

- consulta `get_team_view`;
- valida se o emissor tem papel de comandante do time ou corresponde ao `ADMINISTRADOR_ID`;
- localiza oficiais e engenheiros do mesmo time;
- envia mensagens privadas para esses jogadores pedindo construcao de nodos.

### 7. Performance e VIP

Quando o bot de performance encontra `MATCH ENDED`:

- deduplica o evento por memória, cooldown e arquivo de estado;
- consulta `get_seed_vip_config` e `get_gamestate` para só continuar a premiação fora do seed;
- consulta `get_live_game_stats`, `get_team_view` e `get_vip_ids`;
- calcula o score de cada jogador pela classe final em que terminou a partida;
- premia quem bateu a meta configurada da própria classe;
- envia o anúncio público de performance;
- chama `add_vip` para vencedores sem VIP;
- envia mensagem privada para cada vencedor premiado.

Os comandos administrativos ficam desativados por padrão. Para testes locais, configure `ENABLE_TEST_COMMANDS=true` e `ADMINISTRADOR_ID`; nesse modo, só o jogador com esse SteamID pode executar os comandos e todas as prévias são enviadas por mensagem privada para o próprio administrador. Esses comandos não usam `message_all_players`, não enviam PM para os jogadores listados e não concedem VIP.

Resumo dos comandos administrativos:

| Comando | Bot | Requisito | Destino |
| --- | --- | --- | --- |
| `!t` | Top Bot | `ENABLE_TEST_COMMANDS=true` e emissor igual a `ADMINISTRADOR_ID` | Privado para `ADMINISTRADOR_ID` |
| `!tp` | Performance Bot | `ENABLE_TEST_COMMANDS=true` e emissor igual a `ADMINISTRADOR_ID` | Privado para `ADMINISTRADOR_ID` |
| `!classes` | Performance Bot | `ENABLE_TEST_COMMANDS=true` e emissor igual a `ADMINISTRADOR_ID` | Privado para `ADMINISTRADOR_ID` |
| `!commander`, `!officer`, `!rifleman`/`!shooter`, `!assault`, `!automaticrifleman`, `!medic`, `!support`, `!machinegunner`, `!antitank`, `!engineer`, `!tankcommander`, `!crewman`, `!spotter`, `!sniper` | Performance Bot | `ENABLE_TEST_COMMANDS=true` e emissor igual a `ADMINISTRADOR_ID` | Privado para `ADMINISTRADOR_ID` |

Resumo do comando de nodos:

| Comando | Requisito | Destino |
| --- | --- | --- |
| `!n` / `!nodos` | Comandante do time ou `ADMINISTRADOR_ID` presente em um time | Privado para oficiais e engenheiros do mesmo time |

### 8. Fallback de dados

O ranking usa `get_live_game_stats` por padrão. Se a resposta vier sem `stats`, o processo tenta fallback com `get_live_scoreboard`.

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
| --- | --- | --- | --- |
| `RCON_API_TOKEN` | Sim | - | Token Bearer da API do CRCON. |
| `RCON_BASE_URL` | Sim | - | Base URL do painel/instância CRCON. |
| `PROD_SSH_ADDRESS` | Para deploy via SSH | - | Endereço SSH da VPS de produção, por exemplo `usuario@servidor`. |
| `PROD_PROJECT_DIR` | Para deploy via SSH | `/root/hll_rcon_topkill_bot` | Diretório do projeto na VPS de produção. |
| `BOT_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Top Bot. |
| `BOT_LOG_WINDOW` | Não | `120` | Janela de logs recentes consultados por ciclo no Top Bot. |
| `BOT_LOCK_FILE` | Não | `artifacts/bot.lock` | Arquivo usado para lock do Top Bot. |
| `BOT_TOP_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!top`. |
| `BOT_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown para evitar republicações de `MATCH ENDED` pelo Top Bot. |
| `TOP_LIMIT` | Não | `10` | Quantidade de jogadores exibidos no ranking. |
| `TOP_INCLUDE_HEADER` | Não | `true` | Adiciona ou remove cabeçalho da mensagem formatada. |
| `TOP_COMMAND_ADMIN_ONLY` | Não | `false` | Quando `true`, o Top Bot só processa `!top` enviado pelo `ADMINISTRADOR_ID`. Útil para rodar bot local no servidor real sem responder a comandos de outros jogadores. |
| `TOP_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário para coletar dados do ranking. |
| `BOT_DRY_RUN` | Não | `false` | Não envia mensagens reais; apenas loga as ações. |
| `BOT_STATE_FILE` | Não | `artifacts/bot-state.json` | Persistência de estado para deduplicação entre restarts. |
| `TOP_BOT_ENABLED` | Não | `true` | Ativa o bot de `!top` no runner `npm run bots`. |
| `OP_BOT_ENABLED` | Não | `true` | Ativa o comando `!op` dentro do Top Bot. |
| `PERFORMANCE_INFO_BOT_ENABLED` | Não | `true` | Ativa o bot informativo `!perf`/`!performance`. |
| `PERFORMANCE_BOT_ENABLED` | Não | `false` | Ativa o bot de performance/VIP no runner. |
| `ENABLE_TEST_COMMANDS` | Não | `false` | Ativa comandos administrativos privados, como `!t`, `!tp`, `!classes` e métricas por classe. |
| `ADMINISTRADOR_ID` | Para comandos administrativos | - | SteamID autorizado a executar comandos administrativos e receber as prévias por privado. Tambem pode acionar `!nodos` sem ser comandante, se estiver em um time. |
| `PERFORMANCE_INFO_DRY_RUN` | Não | `false` | Não envia respostas reais do Performance Info Bot; apenas loga as ações. |
| `PERFORMANCE_INFO_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Performance Info Bot. |
| `PERFORMANCE_INFO_LOG_WINDOW` | Não | `120` | Janela de logs recentes do Performance Info Bot. |
| `PERFORMANCE_INFO_LOCK_FILE` | Não | `artifacts/performance-info-bot.lock` | Arquivo de lock do Performance Info Bot. |
| `PERFORMANCE_INFO_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!perf`/`!performance`. |
| `PERFORMANCE_PROCESS_MATCH_END` | Não | `true` | Processa `MATCH ENDED` real. Use `false` em teste local para permitir `!tp`, `!classes` e comandos por classe sem publicar nem premiar jogadores. |
| `PERFORMANCE_SEND_PUBLIC` | Não | `true` | Envia anúncio público de performance no `MATCH ENDED`. |
| `PERFORMANCE_SEND_WINNER_PRIVATE` | Não | `true` | Envia mensagem privada para vencedores premiados. |
| `PERFORMANCE_GRANT_VIP` | Não | `true` | Chama `add_vip` para vencedores sem VIP. |
| `PERFORMANCE_VIP_EXPIRATION` | Não | `1 day` | Duracao relativa (`1 day`, `24 hours`, `90 minutes`) ou data ISO; o bot converte para timestamp absoluto antes do `add_vip`. |
| `PERFORMANCE_MIN_PLAYERS_FOR_VIP` | Não | `41` | Fallback de minimo de jogadores para publicar e conceder VIP por performance se `get_seed_vip_config` nao retornar `requirements.max_allies` e `requirements.max_axis`. |
| `PERFORMANCE_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs do Performance Bot. |
| `PERFORMANCE_LOG_WINDOW` | Não | `120` | Janela de logs recentes do Performance Bot. |
| `PERFORMANCE_LOCK_FILE` | Não | `artifacts/performance-bot.lock` | Arquivo de lock do Performance Bot. |
| `PERFORMANCE_STATE_FILE` | Não | `artifacts/performance-bot-state.json` | Persistência de estado do bot de performance. |
| `PERFORMANCE_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown de `MATCH ENDED` do bot de performance. |
| `PERFORMANCE_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário para coleta dos dados de performance. |

## Deploy em VPS

Produção deve fazer checkout de `main`. Antes de reiniciar o serviço, confirme que a VPS está em `main` e que o `pull` é fast-forward.

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

Ou use o instalador:

```bash
./deploy/install-pm2.sh
```

#### Exemplo de unit com systemd

O instalador abaixo cria ou atualiza a unit usando `npm run bots` por padrão:

```bash
./deploy/install-systemd.sh
```

Exemplo da unit gerada:

```ini
[Unit]
Description=HLL Bots
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/hll_rcon_topkill_bot
ExecStart=/usr/bin/npm run bots
Restart=always
RestartSec=5
User=root
Environment=NODE_ENV=production
EnvironmentFile=/root/hll_rcon_topkill_bot/.env

[Install]
WantedBy=multi-user.target
```

### Atualização segura em produção por SSH

Use esse fluxo quando o código já estiver testado localmente e a VPS tiver o repositório clonado.

No seu ambiente local, carregue os dados de SSH do `.env`:

```bash
set -a
source .env
set +a
```

O `git pull --ff-only` evita merge automático em produção; se houver alteração local ou divergência de branch, ele falha e você resolve antes de reiniciar.

Se o bot roda manualmente, sem supervisor:

```bash
ssh "$PROD_SSH_ADDRESS"
cd /root/hll_rcon_topkill_bot
git branch --show-current
git status --short
npm run stop
git pull --ff-only origin main
npm ci
node --check src/bot.js
node --check src/performanceBot.js
node --check src/performanceInfoBot.js
npm run bots
```

Se `PROD_PROJECT_DIR` no `.env` for diferente de `/root/hll_rcon_topkill_bot`, use esse caminho no `cd`.

Se a produção estiver sob PM2:

```bash
ssh "$PROD_SSH_ADDRESS"
cd /root/hll_rcon_topkill_bot
pm2 stop hll-bots
git branch --show-current
git status --short
git pull --ff-only origin main
npm ci
node --check src/bot.js
node --check src/performanceBot.js
node --check src/performanceInfoBot.js
pm2 restart hll-bots --update-env
pm2 logs hll-bots --lines 80
```

Se a produção estiver sob `systemd`:

```bash
ssh "$PROD_SSH_ADDRESS"
cd /root/hll_rcon_topkill_bot
sudo systemctl stop hll-top-bot
git branch --show-current
git status --short
git pull --ff-only origin main
npm ci
node --check src/bot.js
node --check src/performanceBot.js
node --check src/performanceInfoBot.js
sudo systemctl restart hll-top-bot
sudo journalctl -u hll-top-bot -n 80 --no-pager
```

Checklist antes de considerar o deploy concluído:

- `git branch --show-current` retorna `main`;
- `git status --short` não mostra alterações inesperadas na VPS;
- não existe erro de lock em `artifacts/*.lock`;
- logs mostram os bots iniciando uma única vez;
- `!top`, `!perf` e o preview admin `!tp` respondem quando acionados pelo administrador.

### Parar bots em produção por SSH

Para parar os bots usando o script do projeto, carregue as variáveis locais e execute o `npm run stop` dentro da VPS:

```bash
set -a
source .env
set +a
ssh "$PROD_SSH_ADDRESS"
cd /root/hll_rcon_topkill_bot
npm run stop
```

O comando `npm run stop` executa `src/clear.js`: ele envia `SIGTERM` para processos dos bots, força `SIGKILL` se algum processo não encerrar e remove os locks em `artifacts/`.

Se `PROD_PROJECT_DIR` no `.env` for diferente de `/root/hll_rcon_topkill_bot`, use esse caminho no `cd`.

Para rodar em uma linha a partir da sua máquina local:

```bash
set -a; source .env; set +a; ssh "$PROD_SSH_ADDRESS" "cd ${PROD_PROJECT_DIR:-/root/hll_rcon_topkill_bot} && npm run stop"
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

### O bot não responde ao `!op`

- confirme se `OP_BOT_ENABLED` não está como `false`;
- confirme se os logs de chat chegam em `get_recent_logs` com conteúdo `!op`;
- valide se emissor e oficial do squad começam com `≫ ` ou `»BAIN« `;
- confirme se o emissor aparece em um squad no `get_team_view`;
- revise o cooldown de `BOT_TOP_COMMAND_COOLDOWN_MS`, usado também pelo comando `!op`.

### `!tp` ou `!t` não respondem

- confirme se `ENABLE_TEST_COMMANDS=true` no `.env` carregado pelo processo;
- confirme se `ADMINISTRADOR_ID` bate exatamente com o `player_id_1` do jogador nos logs do CRCON;
- envie o comando depois do warm-up inicial do bot, pois o primeiro ciclo marca logs antigos como já vistos;
- confira se o terminal registrou `[event] admin performance preview detected` ou `[event] admin !t detected`;
- se aparecer `ignored because player is not allowed`, o ID configurado não corresponde ao emissor.

### `!n` ou `!nodos` não enviam mensagens

- confirme se o emissor é comandante do time ou é o `ADMINISTRADOR_ID`;
- se for administrador, ele precisa aparecer em algum time no `get_team_view` para o bot saber qual time receberá os lembretes;
- confirme se existem oficiais ou engenheiros no mesmo time;
- revise o cooldown de `BOT_TOP_COMMAND_COOLDOWN_MS`, usado também para reduzir spam do comando de nodos;
- confira se o terminal registrou `[nodos] !nodos validated`.

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
