# Relatorio de implementacao: bloquear VIP por performance durante seed

Leitura realizada em 2026-05-21.

## Objetivo

O bot de performance deve premiar VIP apenas quando a partida ja saiu do estado
de seed. Para a regra operacional informada neste ajuste, isso significa conceder
VIP somente com `40` jogadores ou mais no servidor.

## Status

Implementado nesta entrega em `src/performanceBot.js`, com configuracao em
`.env.example` e documentacao operacional no `README.md`.

Regra alvo:

```text
se total_jogadores >= 40:
  pode conceder VIP por performance
senao:
  nao concede VIP por performance
```

## Base consultada

- `README.md`: descreve que o bot de performance processa `MATCH ENDED`,
  calcula vencedores, publica o resultado, chama `add_vip` e envia mensagens
  privadas para vencedores premiados.
- `docs/plans/top-performance-vip-bots.md`: documenta o fluxo de VIP por
  performance, a consulta de `get_vip_ids` para evitar acumulo e o uso de
  `add_vip`.
- `docs/incidents/2026-05-07-performance-vip-expiration.md`: registra o ajuste
  anterior para sempre enviar expiracao absoluta ao `add_vip`, evitando VIP
  permanente acidental.
- `get_api_documentation.json`: expõe os endpoints relevantes do CRCON:
  - `get_gamestate`, com contagem de jogadores por time;
  - `get_auto_mod_seeding_config`;
  - `get_seed_vip_config`;
  - `get_real_vip_config`;
  - `get_live_game_stats`, `get_live_scoreboard`, `get_vip_ids` e `add_vip`.
- `src/performanceBot.js` e `src/performance.js`: mostram o comportamento atual
  da coleta, formatacao das mensagens e concessao do VIP.

## Estado atual do bot

No fluxo atual de `src/performanceBot.js`:

1. O bot detecta `MATCH ENDED`.
2. Coleta estatisticas com `get_live_game_stats`, com fallback para
   `get_live_scoreboard`.
3. Consulta `get_team_view` e `get_vip_ids`.
4. Monta o resultado publico e as mensagens privadas dos vencedores.
5. Publica o resultado.
6. Para cada vencedor elegivel, chama `add_vip` e envia PM de premiacao.

Hoje nao existe uma verificacao de populacao ou seed antes da premiacao. Assim,
um fim de partida com servidor ainda em seed pode produzir VIP do mesmo modo que
uma partida cheia.

## Fonte tecnica para a regra de seed

O endpoint mais adequado no snapshot atual da API e `get_gamestate`, porque sua
documentacao diz explicitamente que retorna contagem de jogadores por time:

```text
Players: Allied: 0 - Axis: 1
```

O total usado pelo bot deve ser:

```text
allied_players + axis_players
```

No discovery da instancia CRCON realizado em 2026-05-21, a resposta real trouxe
os campos `num_allied_players` e `num_axis_players`. O parser implementado cobre
esse formato estruturado e mantem fallback para nomes alternativos e para a
linha textual documentada acima.

Os endpoints `get_seed_vip_config`, `get_real_vip_config` e
`get_auto_mod_seeding_config` existem no snapshot, mas os campos de retorno nao
estao descritos nele. Eles servem para validacao/discovery da configuracao real
do CRCON, mas nao devem ser a unica base da implementacao sem confirmar o payload
real retornado pela instancia.

## Regra de implementacao proposta

Adicionar uma trava explicita de premiacao ao bot de performance:

- nova configuracao do bot:
  `PERFORMANCE_MIN_PLAYERS_FOR_VIP=40`;
- default inicial: `40`;
- leitura da populacao por `get_gamestate` no processamento real de
  `MATCH ENDED`;
- premiacao habilitada somente quando o total de jogadores for maior ou igual
  ao limite;
- log obrigatorio do total lido, limite configurado e decisao tomada.

Exemplo de decisao em log:

```text
[vip] population gate allowed { playersCount: 40, minPlayers: 40 }
[vip] population gate blocked { playersCount: 39, minPlayers: 40 }
```

## Ponto de ajuste no codigo

O gate deve entrar antes do bot anunciar que houve premio.

Nao basta bloquear apenas `grantVipForWinner()`. O motivo e que
`formatPerformanceMessage()` marca vencedores sem VIP como `VIP 3 dias`, e
`formatPrivateWinnerMessages()` monta PM com `Premio: VIP ate ...`. Se o
`add_vip` for pulado abaixo de 40 jogadores mas essas mensagens forem enviadas,
o bot anuncia um premio que nao foi concedido.

O ajuste deve separar duas decisoes:

1. Calculo de performance:
   continua disponivel para previews administrativos e para o resultado da
   partida, caso se queira manter o anuncio.
2. Premiacao VIP:
   fica condicionada ao gate de populacao no fluxo de producao de
   `MATCH ENDED`.

Para manter o comportamento honesto, ha duas opcoes validas abaixo do limite:

1. Nao publicar a mensagem de performance e nao enviar PM de vencedor.
2. Publicar uma mensagem sem texto de premio VIP e sem PM de premiacao.

Recomendacao para este ajuste: usar a opcao 1 inicialmente. Ela e menor, evita
mensagem enganosa e reduz ruido em partidas de seed.

## Fluxo recomendado

Fluxo real de `MATCH ENDED`:

1. Consultar `get_gamestate`.
2. Extrair o total de jogadores.
3. Comparar com `PERFORMANCE_MIN_PLAYERS_FOR_VIP`.
4. Se o total for menor que `40`:
   - logar que a partida foi bloqueada por seed/populacao;
   - nao publicar anuncio de performance com premio;
   - nao chamar `add_vip`;
   - nao enviar PM de premiacao.
5. Se o total for maior ou igual a `40`:
   - manter o fluxo atual;
   - consultar estatisticas, VIPs atuais e vencedores;
   - publicar o resultado;
   - conceder VIP somente a vencedores sem VIP.

## Falhas e fallback

Falha ao consultar ou interpretar `get_gamestate` deve bloquear a premiacao por
padrao. A escolha e deliberada: premiar durante seed por falta de contagem e
mais arriscado do que deixar uma premiacao pendente em um fim de partida.

O log deve deixar claro o motivo do bloqueio, por exemplo:

```text
[vip] population gate failed closed { endpoint: "get_gamestate", error: "..." }
```

## Itens de implementacao

1. Adicionar a leitura de `PERFORMANCE_MIN_PLAYERS_FOR_VIP` em
   `readEnv()` de `src/performanceBot.js`.
2. Criar helper para consultar `get_gamestate` e normalizar o total de
   jogadores.
3. Aplicar o gate no caminho de producao de `MATCH ENDED` antes de publicar
   mensagem ou enviar premio.
4. Manter previews administrativos independentes do gate, pois nao chamam
   `add_vip` nem premiam jogadores reais.
5. Documentar a nova variavel no `README.md` e na configuracao operacional.
6. Registrar logs de `allowed`, `blocked` e `failed closed`.

## Testes recomendados

| Cenario | Condicao | Resultado esperado |
| --- | --- | --- |
| Seed abaixo do limite | `39` jogadores | nao chama `add_vip`, nao envia PM de premio e nao publica anuncio de premio |
| Limite exato | `40` jogadores | permite o fluxo atual de premiacao |
| Acima do limite | `41+` jogadores | permite o fluxo atual de premiacao |
| Falha do gamestate | timeout, erro HTTP ou payload sem contagem | bloqueia premiacao e loga falha |
| Jogador ja VIP | `>= 40` jogadores e vencedor ja VIP | continua sem acumular VIP |
| Preview admin | comando `!tp` | continua gerando preview privado sem premiar |

## Validacoes operacionais antes do deploy

1. Confirmar no CRCON que o limite operacional de saida do seed e realmente
   `40` jogadores.
2. Fazer discovery do payload real de `get_gamestate` na instancia usada em
   producao e registrar o formato retornado.
3. Opcionalmente consultar `get_seed_vip_config` e `get_real_vip_config` para
   documentar como o CRCON esta configurado hoje.
4. Testar um fim de partida controlado abaixo do limite e outro no limite exato
   antes de ativar a concessao real.

## Conclusao

O ajuste necessario e um gate de populacao no bot de performance. Com a regra
atual informada, o bot deve tratar `40` jogadores como minimo para premiar VIP.
O endpoint mais claro no snapshot de API para sustentar essa decisao e
`get_gamestate`. A implementacao deve bloquear a premiacao antes das mensagens
de premio para impedir que o bot anuncie VIP durante seed sem realmente
concede-lo.
