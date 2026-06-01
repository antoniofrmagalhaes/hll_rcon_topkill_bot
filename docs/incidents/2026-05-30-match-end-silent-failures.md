# Falhas silenciosas no processamento de MATCH ENDED

Investigacao em 2026-05-30.

Os bots de top 10 abates e top performance deixavam de enviar mensagens de fim de partida de forma intermitente, sem nenhum erro visivel para o operador. O problema era causado por quatro bugs independentes no fluxo de MATCH ENDED.

## Bugs encontrados

### 1. `sendRankingSnapshot` bloqueava `broadcastTop`

`bot.js` chamava `sendRankingSnapshot` antes de `broadcastTop` sem protecao de erro.

`sendRankingSnapshot` chama `get_map_history` e depois `pickBestMatch`, que lanca excecao quando a diferenca de tempo entre o log e o registro no historico excede 15 minutos. Isso e comum: no momento exato do MATCH ENDED, a partida recém-encerrada pode ainda nao ter aparecido em `get_map_history`.

A excecao subia ate o `while(true)` de `main()`, era capturada silenciosamente, e `broadcastTop` nunca executava. Como `seenMatchEndEvents` ja havia sido marcado antes das chamadas de API (ver bug 2), o evento era descartado permanentemente na sessao atual.

### 2. `remember(seenMatchEndEvents)` chamado antes das chamadas de API

Em ambos os bots, o evento era marcado como "visto" em memoria antes das chamadas de API que podiam falhar. Se qualquer chamada lancasse excecao apos essa marcacao, o evento ficava preso: marcado como processado, mas sem mensagem enviada nem estado salvo no disco.

Na mesma sessao, o evento era ignorado em todos os ticks seguintes. Apenas um restart do bot (que zera `seenMatchEndEvents`) permitia tentar de novo — e mesmo assim dependia de o estado do disco ainda ter a chave antiga.

### 3. Colisao de chave em `matchEndKey` para partidas com mesmo resultado

A chave de deduplicacao era baseada apenas no conteudo textual do log:

```
"match-ended|`st marie du mont warfare` allied (0 - 5) axis"
```

Duas partidas com o mesmo mapa e placar, jogadas horas ou dias depois, geravam a mesma chave. A segunda era descartada silenciosamente pelo check `state.lastMatchEndKey === currentMatchEndKey`, sem nenhum log explicando o motivo.

### 4. `loadState()` chamado dentro de `pollLogs()` em cada ciclo com MATCH ENDED

`bot.js` recarregava o estado do disco toda vez que detectava um MATCH ENDED no ciclo de polling. Se `saveState()` havia falhado no ciclo anterior (por excecao), o estado recarregado era mais antigo que o esperado, criando inconsistencia entre disco e memoria.

## Estado do bot de performance

`artifacts/performance-bot-state.json` registrava `updatedAt: 2026-05-09`, 21 dias antes desta investigacao. O cooldown de 5 minutos havia expirado ha muito tempo. A causa mais provavel e que `PERFORMANCE_BOT_ENABLED` estava ausente ou `false` no `.env`, impedindo o bot de subir. A combinacao dos bugs 2 e 3 tambem poderia causar esse comportamento mesmo com o bot rodando.

## Correcoes aplicadas

**`src/bot.js` e `src/performanceBot.js`:**

1. `matchEndKey` agora inclui um bucket de timestamp de 5 minutos como sufixo da chave. Partidas com o mesmo resultado em momentos diferentes recebem chaves distintas. O bucket de 5 minutos se alinha ao cooldown padrao: dois eventos dentro da mesma janela teriam a mesma chave, mas o cooldown ja bloquearia o segundo de qualquer forma.

2. `remember(seenMatchEndEvents, key)` foi movido para depois das chamadas de API. Se qualquer chamada falhar, o evento nao e marcado e o proximo tick retenta automaticamente.

3. Em `bot.js`, `sendRankingSnapshot` foi isolado em try/catch proprio. Falhas no snapshot sao logadas e o `broadcastTop` sempre executa em seguida.

4. Em `bot.js`, `loadState()` foi removido de dentro de `pollLogs()`. O estado e carregado uma vez em `main()` na inicializacao e atualizado em memoria apos cada processamento.

5. Em 2026-06-01, `broadcastTop` no fluxo de `MATCH ENDED` passou a ser protegido por `try/catch`. Se o broadcast falhar, o evento nao e marcado como processado e sera retentado no proximo polling. Se o broadcast concluir com sucesso, os guards de deduplicacao sao gravados normalmente.

## Compatibilidade com arquivos de estado existentes

Os arquivos `artifacts/bot-state.json` e `artifacts/performance-bot-state.json` contem chaves no formato antigo (sem bucket de timestamp). Apos o deploy, essas chaves nao batirao com nenhuma nova chave — o que faz a primeira partida apos o restart ser processada normalmente. O cooldown de 5 minutos ainda protege contra duplicatas durante a transicao.

Nao e necessario apagar os arquivos de estado.

## Verificacao apos deploy

```bash
grep PERFORMANCE_BOT_ENABLED .env        # confirmar true
npm run service:refresh
journalctl -u hll-bots -f | grep -E "MATCH ENDED|snapshot|broadcast sent"
```

Ao fim da proxima partida, os logs devem mostrar:
- `[event] MATCH ENDED detected`
- `[top] broadcast sent (1 message)`
- Para o bot de performance: `[event] MATCH ENDED detected for performance` seguido de `[performance] sending public performance message`
