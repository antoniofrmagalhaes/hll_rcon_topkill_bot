# Finding 01 — broadcastTop sem try/catch causa retry infinito no MATCH ENDED

Identificado em 2026-06-01. Severidade: **CRÍTICA**.

Status: **resolvido em 2026-06-01**.

## Descrição

Em `src/bot.js`, o fluxo de MATCH ENDED executava `broadcastTop` sem proteção de erro. Se a chamada lançasse exceção, as linhas de marcação (`remember`, `state.lastMatchEndKey=`, `saveState`) nunca executavam. O `while(true)` em `main()` capturava o erro, logava `poll error` e o bot continuava. Na próxima poll, se o mesmo log de MATCH ENDED ainda estivesse na janela de logs recentes, nenhum guard teria sido setado, e `broadcastTop` seria chamado novamente.

```
// estado anterior em src/bot.js (~linha 900)
try {
  await sendRankingSnapshot(client, cfg, latestMatchEndedLog);
} catch (err) {
  logInfo("[ranking] snapshot failed, continuing with broadcast", { error: err.message });
}
await broadcastTop(client, cfg, "fim da partida");   // ← SEM try/catch
remember(seenMatchEndEvents, currentMatchEndKey);    // ← nunca executa se broadcastTop lança
state.lastMatchEndKey = currentMatchEndKey;          // ← nunca executa
state.lastMatchEndedAtMs = nowMs;                    // ← nunca executa
saveState();                                         // ← nunca executa
```

## Risco

- **Reprocessamento indefinido enquanto o log estiver na janela:** cada polling poderia tentar reenviar o ranking de fim de partida até o log sair da janela consultada.
- **Spam de mensagem pública em falhas ambíguas:** se o CRCON aceitasse o envio, mas respondesse erro ou falhasse após processar a mensagem, o ranking poderia aparecer repetidamente para os jogadores.
- **Janela de exposição:** o default do repositório é `BOT_LOG_WINDOW=120`, mas a janela pode ser maior em produção via variável de ambiente.
- **Condição de gatilho:** falha transitória de rede, erro 5xx ou `failed=true` do CRCON em `message_all_players`.

## Evidência nos logs

Não observado no código novo em produção ainda (serviço reiniciado em 2026-06-01). Cenário análogo de 500 em `message_player` foi registrado em May 31 00:30:13 (código anterior), confirmando que falhas de API no fluxo de MATCH ENDED ocorrem em produção.

## Mitigação temporária

Nenhuma disponível sem reiniciar o serviço. Após reiniciar, o `state.lastMatchEndKey` carregado do disco (se o evento anterior foi bem-sucedido) pode bloquear o reprocessamento pelo guard de chave.

## Correção recomendada

Envolver `broadcastTop` em try/catch e mover os guards para dentro do caminho de sucesso. Se `broadcastTop` lançar, logar e retornar sem marcar — o próximo tick retenta naturalmente.

```js
try {
  await sendRankingSnapshot(client, cfg, latestMatchEndedLog).catch((err) => {
    logInfo("[ranking] snapshot failed, continuing with broadcast", { error: err.message });
  });
  await broadcastTop(client, cfg, "fim da partida");
} catch (err) {
  logInfo("[event] MATCH ENDED broadcast failed, will retry", { error: err.message });
  return;
}
remember(seenMatchEndEvents, currentMatchEndKey);
state.lastMatchEndKey = currentMatchEndKey;
state.lastMatchEndedAtMs = nowMs;
saveState();
```

Com essa estrutura, falha em `broadcastTop` resulta em retry no próximo tick sem marcar o evento como processado — exatamente o comportamento pretendido pelo ADR `2026-05-30-match-end-dedup-ordering.md`.

## Resolução

Resolvido em 2026-06-01.

O fluxo de `MATCH ENDED` agora executa `sendRankingSnapshot` e `broadcastTop` dentro de um bloco protegido. Falhas no snapshot continuam sendo apenas logadas, mas falhas no broadcast interrompem o processamento do evento antes de gravar os guards.

Quando o broadcast falha, o evento não é marcado como processado e será retentado no próximo polling. Quando o broadcast conclui com sucesso, os guards são gravados normalmente:

- `seenMatchEndEvents`
- `state.lastMatchEndKey`
- `state.lastMatchEndedAtMs`
- `saveState()`

Validação:

```bash
node --check src/bot.js
```

## Arquivos afetados

- `src/bot.js` — função `pollLogs`, bloco de MATCH ENDED (~linha 900)
