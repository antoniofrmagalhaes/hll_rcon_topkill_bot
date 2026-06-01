# Finding 02 — publishPerformanceProduction sem try/catch causa VIP duplicado em retry

Identificado em 2026-06-01. Severidade original: **CRÍTICA**.

Status: **rejeitado em 2026-06-01 — falso positivo para VIP duplicado**.

## Descrição

Em `src/performanceBot.js`, o bloco de MATCH ENDED chama `collectPerformance` e `publishPerformanceProduction` sem try/catch envolvente. Se qualquer uma dessas chamadas lançar exceção, `state.lastMatchEndKey`, `state.lastMatchEndedAtMs`, `saveState()` e `remember(seenMatchEndEvents)` nunca executam. O `while(true)` em `main()` captura o erro silenciosamente. Na próxima poll o mesmo evento re-dispara.

```
// estado atual em src/performanceBot.js (~linha 818)
const { message, privateWinnerMessages } = await collectPerformance(client, cfg);
await publishPerformanceProduction(client, cfg, message, privateWinnerMessages);
// ↓ nunca executa se qualquer linha acima lançar
state.lastMatchEndKey = currentMatchEndKey;
state.lastMatchEndedAtMs = nowMs;
saveState();
remember(seenMatchEndEvents, currentMatchEndKey);
```

## Revisão

A hipótese de VIP duplicado por falha em `message_all_players` não se confirma no código atual.

Em `src/performanceBot.js`, `publishPerformanceProduction` envia `message_all_players` antes de iniciar o loop de vencedores. Portanto, se o envio público lança exceção, nenhum VIP foi concedido ainda.

Além disso, dentro do loop de vencedores, `grantVipForWinner` e `sendWinnerPrivate` ficam protegidos por `try/catch` por jogador. Falha em `message_player` é logada, mas não impede `state.lastMatchEndKey`, `state.lastMatchEndedAtMs`, `saveState()` e `remember(...)` de executarem.

Risco residual real: mensagem pública duplicada se a API aceitar `message_all_players` e retornar erro antes do estado ser salvo. Esse risco já é compatível com o ADR `docs/adr/2026-05-30-match-end-dedup-ordering.md`.

## Risco originalmente apontado

- **VIP duplicado:** `publishPerformanceProduction` concede VIPs individualmente por jogador em try/catch interno. Se a concessão de VIP para os primeiros ganhadores tiver sucesso mas o envio da mensagem pública (`message_all_players`) falhar logo depois, o estado não é salvo. Na retry, os mesmos jogadores recebem VIP novamente.
- **Mensagem pública duplicada:** `message_all_players` pode ter sido aceita pelo servidor antes de retornar erro HTTP — o conteúdo aparece no jogo e é reenviado no próximo tick.
- **Condição de gatilho:** timeout de rede, erro 500 do CRCON em `message_all_players`, ou falha em `collectPerformance` (ex: `get_live_game_stats` indisponível).

## Evidência nos logs

May 31 00:30:13 — `[POST] message_player failed (500)` durante envio de mensagem privada de vencedor. Os VIPs já haviam sido concedidos nos ticks anteriores (00:30:10 a 00:30:12). O erro foi contido por-winner, mas evidencia que falhas de API no fluxo de MATCH ENDED de performance ocorrem em produção.

## Diferença com bot.js

Rejeitada. Em `performanceBot.js`, falha em `message_all_players` ocorre antes de qualquer concessão de VIP.

## Mitigação temporária

Não aplicável para este finding.

## Correção recomendada

Nenhuma correção necessária para VIP duplicado no cenário descrito.

## Arquivos afetados

- `src/performanceBot.js` — função `pollLogs`, bloco de MATCH ENDED (~linha 818)
