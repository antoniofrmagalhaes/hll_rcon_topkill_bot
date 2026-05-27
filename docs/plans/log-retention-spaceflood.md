# Plano de acao: retencao de logs e prevencao de space flood

## Contexto

Em 2026-05-27, a VPS de producao `root@72.60.254.177` foi verificada com o servico
`hll-top-bot.service` rodando via `systemd` em `/root/hll_rcon_topkill_bot`.

Leitura encontrada:

- disco `/`: 48G total, 7.8G usado, 40G livre, 17%;
- `/var/log`: 1.8G;
- `/var/log/journal`: 1.1G;
- journal total reportado: 1.0G;
- `/root/hll_rcon_topkill_bot/artifacts/bots.log`: 103M, 2.576.635 linhas, parado desde 2026-05-13;
- `hll-top-bot` no journal: cerca de 78 mil linhas na ultima hora;
- `hll-top-bot` nas ultimas 24h: cerca de 1.229.346 linhas;
- producao estava com polling de 1000ms, janela 1000 e 3 bots ativos.

O disco nao estava em risco imediato, mas o volume de log e alto o suficiente para causar
space flood se a retencao do journal estiver sem limite ou se o processo voltar para PM2 sem
rotacao.

## Objetivo operacional

- manter logs consultaveis dos ultimos 2 dias;
- evitar crescimento sem limite de stdout/stderr;
- reduzir volume de log gerado em funcionamento normal;
- preservar logs de evento, erro, lock, state, comandos e acoes enviadas.

## Configuracao padrao do bot

Usar estes valores como base em producao:

```env
BOT_POLL_INTERVAL_MS=5000
BOT_LOG_WINDOW=120
PERFORMANCE_INFO_POLL_INTERVAL_MS=5000
PERFORMANCE_INFO_LOG_WINDOW=120
PERFORMANCE_POLL_INTERVAL_MS=5000
PERFORMANCE_LOG_WINDOW=120
```

Evitar `1000ms` com janela `1000` em producao, exceto durante diagnostico pontual e com
retencao ativa.

## Retencao quando rodar via systemd

O servico atual usa `systemd`; portanto os logs vivos ficam no `journald`.

Configurar limite global do journal em `/etc/systemd/journald.conf` ou em drop-in equivalente:

```ini
[Journal]
SystemMaxUse=512M
MaxRetentionSec=2day
Compress=yes
```

Aplicar:

```bash
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-time=2d
sudo journalctl --disk-usage
```

Validar:

```bash
sudo journalctl -u hll-top-bot --since "2 days ago" --no-pager
sudo journalctl -u hll-top-bot --since "1 hour ago" --no-pager | wc -l
```

## Retencao quando rodar via PM2

Se o processo voltar para PM2, instalar e configurar rotacao antes de deixar em producao:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"
pm2 set pm2-logrotate:retain 2
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:max_size 50M
pm2 save
```

Validar:

```bash
pm2 logs hll-bots --lines 80
du -sh ~/.pm2/logs
```

## Proxima melhoria de codigo

Mover logs repetitivos de polling e retorno de `get_recent_logs` para modo debug:

- `[poll] reading recent logs`;
- `[poll] get_recent_logs return summary`;
- `[poll] logs received`;
- `[rcon] [POST] get_recent_logs return`.

Criar uma flag `BOT_DEBUG_LOGS=true` para reativar esses logs quando necessario.

## Checklist de manutencao

- antes de deploy: confirmar polling e janela no `.env` de producao;
- depois de deploy: medir `journalctl --disk-usage`;
- semanalmente: verificar se `/var/log/journal` segue abaixo do limite;
- se logs crescerem acima do esperado: reduzir ruido de polling antes de aumentar disco;
- se usar PM2: confirmar `pm2-logrotate` instalado e ativo.
