# hll-bots

Bot de discovery + automacao para CRCON (Hell Let Loose).

## O que este projeto faz

- Descobre endpoints da API do CRCON e salva artefato local.
- Monitora chat para comando `!top`.
- Responde o `!top` em mensagem privada para quem executou o comando.
- Publica automaticamente top 10 quando detectar `MATCH ENDED`.

## Requisitos

- Node.js 18+
- API token com permissoes para:
  - `get_recent_logs`
  - `get_live_game_stats`
  - `message_all_players`
  - `message_player`

## Configuracao

1. Copie `.env.example` para `.env`
2. Preencha `RCON_API_TOKEN` e `RCON_BASE_URL`

Exemplo de base URL:
- `https://srv-adm.bainclan.com.br`

## Comandos

- Discovery dos endpoints:

```bash
npm run discover
```

- Rodar o bot:

```bash
npm run bot
```

- Encerrar processo do bot:

```bash
npm run clear
```

## Teste local agora

1. Instale dependencias:

```bash
npm install
```

2. Confira seu `.env` com:
- `RCON_BASE_URL=https://...`
- `RCON_API_TOKEN=...`

3. Inicie o bot:

```bash
npm run bot
```

4. No jogo, envie `!top` no chat.

5. Verificacao no terminal:
- Se estiver funcionando, voce vera logs sem `fetch failed`.

## Como o bot detecta eventos

- Comando `!top`:
  - Poll em `get_recent_logs` (uma chamada por ciclo).
  - Quando encontra `sub_content` igual a `!top`, calcula ranking e responde via `message_player` em uma unica mensagem para quem chamou.

- Final da partida:
  - No mesmo polling de logs, detecta eventos `MATCH ENDED`.
  - Ao detectar novo evento, calcula ranking e publica.

## Observacoes importantes (discovery)

- O ranking usa `get_live_game_stats` por padrao (partida atual em andamento).
- Se `get_live_game_stats` vier sem `stats`, o bot tenta fallback em `get_live_scoreboard`.
- Dependendo do timing do `MATCH ENDED`, o snapshot pode variar alguns segundos.
- O bot persiste deduplicacao de `MATCH ENDED` em arquivo (`artifacts/bot-state.json` por padrao), evitando republicar o mesmo fim de partida apos restart.
- O bot cria um lock de processo (`artifacts/bot.lock` por padrao). Se outra instancia estiver rodando, a nova aborta antes de responder `!top` ou anunciar fim de partida.

## Parametros uteis

- `BOT_POLL_INTERVAL_MS`: frequencia de polling
- `BOT_LOG_WINDOW`: janela de logs recentes
- `BOT_LOCK_FILE`: arquivo de lock para impedir duas instancias do bot ao mesmo tempo
- `BOT_TOP_COMMAND_COOLDOWN_MS`: janela anti-duplicacao por jogador para `!top`
- `BOT_MATCH_ENDED_COOLDOWN_MS`: janela anti-duplicacao para `MATCH ENDED` (padrao: `300000` = 5 min)
- `TOP_LIMIT`: quantidade de jogadores no ranking
- `TOP_STATS_ENDPOINT`: endpoint de origem do ranking (padrao: `get_live_game_stats`)
- `BOT_DRY_RUN=true`: nao envia mensagem no servidor, apenas loga no terminal
- `BOT_STATE_FILE`: caminho do arquivo de estado para deduplicacao persistente de `MATCH ENDED`

Comportamento de carga atual:
- 1 request de logs por ciclo (`get_recent_logs`)
- requests extras apenas quando precisa publicar top (scoreboard + mensagens)

## Proximos passos sugeridos

- Persistir cursor/estado em Redis para deduplicacao forte.
- Criar endpoint interno HTTP para healthcheck.
- Migrar para worker em Python mantendo o mesmo contrato de logs/scoreboard.
- Expor fluxo como MCP server (tools: `get-top`, `announce-top`, `watch-match-end`).
