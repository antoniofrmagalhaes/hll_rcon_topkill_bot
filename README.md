<div align="center">
  <h1>HLL RCON Top Bot</h1>
  <p>
    Bot Node.js para <strong>CRCON / Hell Let Loose</strong> focado em
    responder <code>!top</code> e <code>!op</code> no chat e publicar
    automaticamente o ranking de abates ao final da partida.
  </p>
  <p>
    <a href="https://github.com/antoniofrmagalhaes/hll_rcon_topkill_bot">
      <img src="https://img.shields.io/badge/repository-github-black?style=for-the-badge&logo=github" alt="GitHub repository" />
    </a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-43853d?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 18+" />
    <img src="https://img.shields.io/badge/focus-bot%20runtime-0f766e?style=for-the-badge" alt="Bot runtime" />
    <img src="https://img.shields.io/badge/branch-main%20is%20production-1d4ed8?style=for-the-badge" alt="Main is production" />
  </p>
</div>

<br />

## Sumário

- [Visão Geral](#visão-geral)
- [O Que o Bot Faz](#o-que-o-bot-faz)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Requisitos](#requisitos)
- [Configuração](#configuração)
- [Como Executar](#como-executar)
- [Fluxo de Funcionamento](#fluxo-de-funcionamento)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Deploy em VPS](#deploy-em-vps)
- [Operação e Manutenção](#operação-e-manutenção)
- [Troubleshooting](#troubleshooting)
- [Estratégia de Branches](#estratégia-de-branches)

## Visão Geral

Esta branch `main` representa somente o produto operacional: o bot que observa
os logs do CRCON, identifica os comandos `!top` e `!op`, responde em mensagem
privada e anuncia o ranking quando a partida termina.

O objetivo aqui é manter a branch principal limpa, direta e pronta para deploy,
sem misturar código exploratório, artefatos de discovery ou experimentos de API.

<table>
  <tr>
    <td><strong>Foco da main</strong></td>
    <td>Runtime do bot em produção.</td>
  </tr>
  <tr>
    <td><strong>Entrada principal</strong></td>
    <td><code>src/bot.js</code></td>
  </tr>
  <tr>
    <td><strong>Persistência local</strong></td>
    <td>Arquivos de estado e lock em <code>artifacts/</code>.</td>
  </tr>
  <tr>
    <td><strong>Uso esperado</strong></td>
    <td>Deploy em VPS com supervisor de processo.</td>
  </tr>
</table>

## O Que o Bot Faz

- monitora logs recentes do CRCON;
- detecta o comando `!top` enviado no chat;
- detecta o comando `!op` enviado no chat;
- calcula o ranking dos jogadores com mais abates;
- responde o resultado por mensagem privada para quem executou o comando;
- envia lembrete de OP para o oficial do squad quando `!op` passa nas regras de tag;
- detecta `MATCH ENDED` e publica o top automaticamente;
- evita spam e duplicidade com cooldown, lock de processo e estado persistido.

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
  ├─ detecção de !op
  ├─ detecção de MATCH ENDED
  ├─ cooldown / deduplicação
  ├─ persistência de estado
  └─ envio de mensagens
        │
        ├─ src/rconClient.js
        ├─ src/top.js
        └─ src/config.js
```

### Decisões de implementação

- O bot faz uma chamada de logs por ciclo.
- O ranking usa `get_live_game_stats` como fonte principal.
- Se `get_live_game_stats` vier sem `stats`, o bot tenta `get_live_scoreboard`.
- O processo grava estado local para evitar republicar o mesmo `MATCH ENDED`.
- Um arquivo de lock impede duas instâncias respondendo ao mesmo tempo.

## Estrutura do Projeto

```text
.
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── src
│   ├── bot.js
│   ├── clear.js
│   ├── config.js
│   ├── rconClient.js
│   └── top.js
└── artifacts
    ├── bot-state.json
    └── bot.lock
```

### Responsabilidade dos módulos

- `src/bot.js`: loop principal, eventos, cooldown, estado e lock.
- `src/rconClient.js`: cliente HTTP autenticado com logging resumido.
- `src/top.js`: normalização, ordenação e formatação do ranking.
- `src/config.js`: leitura e validação das variáveis de ambiente.
- `src/clear.js`: utilitário operacional de limpeza/encerramento.

## Requisitos

- Node.js `18+`
- acesso à API do CRCON
- token com permissões para:
  - `get_recent_logs`
  - `get_live_game_stats`
  - `message_all_players`
  - `message_player`

## Configuração

1. Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

2. Preencha as variáveis obrigatórias:

```env
RCON_API_TOKEN=seu_token_aqui
RCON_BASE_URL=https://seu-crcon.exemplo.com.br
```

3. Ajuste os parâmetros operacionais conforme o comportamento esperado do servidor.

## Como Executar

### Instalação

```bash
npm install
```

### Iniciar o bot

```bash
npm run bot
```

### Encerrar/limpar estado operacional

```bash
npm run clear
```

### Smoke test manual

1. Configure `RCON_BASE_URL` e `RCON_API_TOKEN`.
2. Execute `npm run bot`.
3. No jogo, envie `!top` no chat.
4. Verifique o terminal.
5. Confirme a mensagem privada entregue ao jogador.

## Fluxo de Funcionamento

### 1. Polling de logs

O bot consulta `get_recent_logs` em intervalo configurável por `BOT_POLL_INTERVAL_MS`.

### 2. Comando `!top`

Quando encontra uma mensagem de chat com `!top`, o processo:

- identifica o jogador emissor;
- aplica deduplicação por evento;
- aplica cooldown por ator;
- calcula o ranking;
- responde usando `message_player`.

### 3. Fim de partida

Quando encontra `MATCH ENDED`, o processo:

- verifica se o evento já foi processado;
- monta o ranking da partida;
- publica o anúncio;
- persiste o último evento tratado.

### 4. Fallback de ranking

O fluxo principal usa `get_live_game_stats`. Quando esse retorno não vier com dados
de `stats`, o bot tenta fallback usando `get_live_scoreboard`.

### 5. Comando `!op`

Quando encontra uma mensagem de chat com `!op`, o processo:

- identifica o jogador emissor;
- aplica deduplicação por evento;
- aplica cooldown por ator;
- valida se o emissor começa com `≫ ` ou `»BAIN« `;
- consulta `get_team_view` para localizar o squad do emissor;
- identifica o oficial do mesmo squad;
- valida se o oficial começa com `≫ ` ou `»BAIN« `;
- envia PM para o oficial com:
  - `MENSAGEM DO PELOTÃO`
  - linha em branco
  - `CADE O OP PORRA?!`

Observações:

- o comando `!op` não verifica estado real do outpost (não há endpoint/log confiável para isso no fluxo atual);
- em `BOT_DRY_RUN=true`, o bot não envia PM real e apenas registra logs.

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
| --- | --- | --- | --- |
| `RCON_API_TOKEN` | Sim | - | Token Bearer da API do CRCON. |
| `RCON_BASE_URL` | Sim | - | Base URL da instância CRCON. |
| `BOT_POLL_INTERVAL_MS` | Não | `5000` | Intervalo do polling de logs. |
| `BOT_LOG_WINDOW` | Não | `120` | Janela de logs recentes por ciclo. |
| `BOT_LOCK_FILE` | Não | `artifacts/bot.lock` | Arquivo usado para lock de processo. |
| `BOT_TOP_COMMAND_COOLDOWN_MS` | Não | `15000` | Cooldown por jogador para `!top`. |
| `BOT_MATCH_ENDED_COOLDOWN_MS` | Não | `300000` | Cooldown para `MATCH ENDED`. |
| `TOP_LIMIT` | Não | `10` | Quantidade de jogadores exibidos. |
| `TOP_INCLUDE_HEADER` | Não | `true` | Inclui cabeçalho na mensagem formatada. |
| `TOP_STATS_ENDPOINT` | Não | `get_live_game_stats` | Endpoint primário do ranking. |
| `BOT_DRY_RUN` | Não | `false` | Não envia mensagens reais; apenas loga. |
| `BOT_STATE_FILE` | Não | `artifacts/bot-state.json` | Arquivo de persistência de estado. |

## Deploy em VPS

### Fluxo mínimo

```bash
git clone git@github.com:antoniofrmagalhaes/hll_rcon_topkill_bot.git
cd hll_rcon_topkill_bot
cp .env.example .env
npm install
npm run bot
```

### Recomendação para produção

Use `pm2` ou `systemd` para garantir restart automático e processo persistente.

### Provisionamento com scripts

```bash
chmod +x deploy/install-systemd.sh deploy/install-pm2.sh
```

#### Instalar com `systemd`

```bash
./deploy/install-systemd.sh
```

Esse comando usa por padrão:

- `APP_DIR="$(pwd)"`
- `APP_USER="$(whoami)"`
- `ENV_FILE="$(pwd)/.env"`

Comando bash equivalente:

```bash
SERVICE_NAME=hll-top-bot
APP_DIR="$(pwd)"
APP_USER="$(whoami)"
ENV_FILE="${APP_DIR}/.env"
NODE_ENV_VALUE=production
NPM_BIN="$(command -v npm)"

cat <<EOF | sudo tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null
[Unit]
Description=HLL RCON Top Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NPM_BIN} run bot
Restart=always
RestartSec=5
User=${APP_USER}
Environment=NODE_ENV=${NODE_ENV_VALUE}
EnvironmentFile=${ENV_FILE}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl status "${SERVICE_NAME}" --no-pager
```

Variáveis opcionais:

- `SERVICE_NAME=hll-top-bot`
- `APP_DIR=$(pwd)`
- `APP_USER=$(whoami)`
- `ENV_FILE=$(pwd)/.env`
- `NODE_ENV_VALUE=production`

Exemplo para instalação no diretório atual:

```bash
SERVICE_NAME=hll-top-bot \
APP_DIR="$(pwd)" \
APP_USER="$(whoami)" \
ENV_FILE="$(pwd)/.env" \
./deploy/install-systemd.sh
```

Exemplo para diretório/usuário customizados:

```bash
SERVICE_NAME=hll-top-bot \
APP_DIR=/opt/hll_rcon_topkill_bot \
APP_USER=www-data \
ENV_FILE=/opt/hll_rcon_topkill_bot/.env \
./deploy/install-systemd.sh
```

#### Instalar com `pm2`

```bash
./deploy/install-pm2.sh
```

Esse comando usa por padrão:

- `APP_DIR="$(pwd)"`
- `ENV_FILE="$(pwd)/.env"`
- `PM2_STARTUP_USER="$(whoami)"`

Comando bash equivalente:

```bash
APP_NAME=hll-top-bot
APP_DIR="$(pwd)"
ENV_FILE="${APP_DIR}/.env"
PM2_STARTUP_USER="$(whoami)"
NODE_ENV_VALUE=production

cd "${APP_DIR}"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

set -a
. "${ENV_FILE}"
set +a
export NODE_ENV="${NODE_ENV_VALUE}"

pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
pm2 start npm --name "${APP_NAME}" --update-env -- run bot
pm2 save
pm2 startup systemd -u "${PM2_STARTUP_USER}" --hp "$HOME"
pm2 status
```

Variáveis opcionais:

- `APP_NAME=hll-top-bot`
- `APP_DIR=$(pwd)`
- `ENV_FILE=$(pwd)/.env`
- `PM2_STARTUP_USER=$(whoami)`
- `NODE_ENV_VALUE=production`

Exemplo para instalação no diretório atual:

```bash
APP_NAME=hll-top-bot \
APP_DIR="$(pwd)" \
ENV_FILE="$(pwd)/.env" \
PM2_STARTUP_USER="$(whoami)" \
./deploy/install-pm2.sh
```

Exemplo para diretório/usuário customizados:

```bash
APP_NAME=hll-top-bot \
APP_DIR=/opt/hll_rcon_topkill_bot \
ENV_FILE=/opt/hll_rcon_topkill_bot/.env \
PM2_STARTUP_USER=www-data \
./deploy/install-pm2.sh
```

## Operação e Manutenção

### Artefatos de runtime

- `artifacts/bot.lock`: evita concorrência entre múltiplas instâncias.
- `artifacts/bot-state.json`: guarda o último `MATCH ENDED` processado.

### Boas práticas

- mantenha `.env` fora do versionamento;
- use `BOT_DRY_RUN=true` ao validar um ambiente novo;
- monitore logs do processo em produção;
- revise permissões do token sempre que houver erro de API.

## Troubleshooting

### `Missing required env var`

Revise o `.env` e confirme se `RCON_API_TOKEN` e `RCON_BASE_URL` estão preenchidos.

### `fetch failed`

- valide conectividade entre a VPS e o CRCON;
- confira DNS, firewall e TLS;
- teste a URL manualmente com `curl`.

### O bot não responde ao `!top`

- valide se o evento está chegando em `get_recent_logs`;
- confirme se a mensagem realmente chega como `!top`;
- revise o cooldown configurado.

### O bot não responde ao `!op`

- valide se o evento está chegando em `get_recent_logs`;
- confirme se a mensagem realmente chega como `!op`;
- confirme se emissor e oficial começam com `≫ ` ou `»BAIN« `;
- revise o cooldown configurado;
- use `BOT_DRY_RUN=true` para validar o fluxo só com logs.

### O anúncio de `MATCH ENDED` não saiu

- confira se o evento apareceu nos logs;
- revise o cooldown de fim de partida;
- inspecione `artifacts/bot-state.json`.

### Há indício de duas instâncias rodando

Confira o lock em `artifacts/bot.lock` e o supervisor de processos da VPS.

## Estratégia de Branches

### `main`

Branch principal e operacional. Deve conter apenas o bot pronto para deploy.

### `discovery`

Branch separada para exploração de API, testes de discovery, artefatos exploratórios
e hipóteses que não pertencem ao runtime principal.

Se no futuro o discovery voltar a ser útil, ele deve evoluir nessa branch sem
contaminar a `main`. A documentação desta branch principal deve continuar
majoritariamente orientada ao funcionamento do bot.

---

<div align="center">
  <sub>Main para produção. Discovery isolado. Documentação alinhada ao runtime real do bot.</sub>
</div>
