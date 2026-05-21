# Relatorio de implementacao: bloquear VIP por performance durante seed

Leitura realizada em 2026-05-21.

## Objetivo

O bot de performance deve premiar VIP apenas quando a partida ja saiu do estado
de seed. O limite nao deve ser mantido fixo no bot quando o CRCON ja possui essa
configuracao.

Regra alvo:

```text
max_seed_players = seed_vip.requirements.max_allies + seed_vip.requirements.max_axis

se total_jogadores > max_seed_players:
  pode conceder VIP por performance
senao:
  nao concede VIP por performance
```

## Status

Implementado em `src/performanceBot.js`, com configuracao documentada em
`.env.example` e no `README.md`.

## Base consultada

- `README.md`: fluxo de `MATCH ENDED`, performance e VIP.
- `docs/plans/top-performance-vip-bots.md`: concessao de VIP por performance e
  uso de `get_vip_ids`/`add_vip`.
- `docs/incidents/2026-05-07-performance-vip-expiration.md`: obrigacao de
  enviar expiracao absoluta ao `add_vip`.
- `get_api_documentation.json`: endpoints `get_gamestate`,
  `get_seed_vip_config`, `get_auto_mod_seeding_config`, `get_vip_ids` e
  `add_vip`.
- Discovery real da instancia CRCON em 2026-05-21, via API e via tool local do
  MCP RCON.

## Discovery do CRCON

`get_gamestate` retornou a populacao atual nos campos:

```text
num_allied_players
num_axis_players
```

`get_seed_vip_config` retornou:

```text
requirements.max_allies = 20
requirements.max_axis = 20
```

Com a configuracao vigente, o limite maximo de seed e `40` jogadores e o bot
deve permitir VIP por performance somente a partir de `41`.

O AutoMod de seed tambem retornou regras com `max_players = 40` no momento do
discovery, mas a fonte primaria deste ajuste e o Seed VIP porque o limite vem da
configuracao de seed usada pelo CRCON para premio VIP.

## Estado anterior

O fluxo anterior de `src/performanceBot.js`:

1. Detectava `MATCH ENDED`.
2. Coletava estatisticas da partida.
3. Consultava `get_team_view` e `get_vip_ids`.
4. Montava mensagens de performance e premio.
5. Publicava o resultado e chamava `add_vip`.

Esse fluxo nao consultava o limite de seed antes de anunciar ou conceder VIP.

## Implementacao

O gate atual faz:

1. Consulta `get_gamestate`.
2. Extrai e soma a populacao dos dois times.
3. Consulta `get_seed_vip_config`.
4. Calcula:

```text
max_seed_players = max_allies + max_axis
min_players_for_performance_vip = max_seed_players + 1
```

5. Continua a premiacao apenas se a populacao atual atingir o minimo calculado.

Se a populacao estiver dentro do seed:

- nao publica mensagem de performance com premio;
- nao chama `add_vip`;
- nao envia PM de premiacao.

## Fallback

`PERFORMANCE_MIN_PLAYERS_FOR_VIP` permanece no bot apenas como fallback se
`get_seed_vip_config` falhar ou nao retornar `requirements.max_allies` e
`requirements.max_axis`.

Default do fallback:

```env
PERFORMANCE_MIN_PLAYERS_FOR_VIP=41
```

Falha ao consultar ou interpretar `get_gamestate` continua bloqueando a
premiacao por padrao, porque sem a populacao atual nao ha como garantir que a
partida saiu do seed.

## Ponto de ajuste no fluxo

O gate fica antes de `collectPerformance()` no caminho real de `MATCH ENDED`.
Isso evita mensagem enganosa: `formatPerformanceMessage()` e
`formatPrivateWinnerMessages()` ja falam em premio VIP para vencedores sem VIP.

Previews administrativos continuam independentes do gate, porque nao concedem
VIP real.

## Logs esperados

```text
[vip] seed VIP population limit loaded
[vip] population gate blocked
[vip] population gate allowed
[vip] seed VIP population limit failed, using fallback
[vip] population gate failed closed
```

## Testes recomendados

| Cenario | Condicao | Resultado esperado |
| --- | --- | --- |
| Seed abaixo do limite | maximo de seed `40`, populacao `39` | bloqueia premio |
| Limite exato do seed | maximo de seed `40`, populacao `40` | bloqueia premio |
| Fora do seed | maximo de seed `40`, populacao `41+` | permite o fluxo atual |
| Config alterada no CRCON | `max_allies`/`max_axis` novos | bot recalcula o minimo no proximo `MATCH ENDED` |
| Falha de Seed VIP config | endpoint sem limite | usa fallback local |
| Falha de gamestate | sem populacao | bloqueia premio |

## Conclusao

O bot nao depende mais de um `40` fixo para decidir se a partida saiu do seed.
Ele usa o limite vigente do Seed VIP no CRCON e deixa o valor local apenas para
fallback operacional.
