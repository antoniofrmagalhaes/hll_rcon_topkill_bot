# Ordenacao da deduplicacao de MATCH ENDED

## Contexto

O fluxo de MATCH ENDED nos bots de top e performance envolve tres operacoes sequenciais: (1) chamadas de API para coletar e publicar dados, (2) marcacao do evento como "visto" em memoria (`seenMatchEndEvents`), e (3) persistencia do estado no disco (`saveState`).

A ordem original marcava o evento como visto *antes* das chamadas de API. Quando qualquer chamada falhava, o evento ficava marcado mas sem processamento real. Na mesma sessao, todos os ticks seguintes ignoravam o evento. A mensagem de fim de partida nunca era enviada.

## Decisao

A marcacao em `seenMatchEndEvents` e a persistencia em disco acontecem somente *depois* de todas as chamadas de API completarem com sucesso.

```
chamadas de API (broadcastTop / publishPerformanceProduction)
  ↓ sucesso
remember(seenMatchEndEvents, key)
state.lastMatchEndKey = key
saveState()
```

Se qualquer chamada de API falhar, o evento nao e marcado e o proximo tick retenta. O cooldown de 5 minutos e o check de `state.lastMatchEndKey` continuam protegendo contra duplicatas reais.

No bot de performance, o mesmo principio se aplica ao caminho da population gate: quando a publicacao e pulada por populacao baixa, o estado e salvo antes do `remember`, garantindo que o evento seja registrado como processado mesmo sem envio publico.

## Consequencias

Positivas:
- Falhas de API sao transparentes: o bot retenta automaticamente no proximo tick sem restart manual.
- O estado em disco reflete apenas eventos realmente processados.

Negativas / riscos:
- Se a API aceita a mensagem mas retorna erro HTTP, o bot retenta e a mensagem pode ser enviada duas vezes. Esse cenario e raro (erro de rede na resposta, nao no envio) e o conteudo seria identico.
- Se `saveState()` falhar (erro de disco) depois de um envio bem-sucedido, o bot retenta apos restart. Mesmo risco de mensagem duplicada, tambem raro.

## Alternativas consideradas

**Marcar antes das chamadas (comportamento original):** garante que a API nunca e chamada duas vezes, mas perde o evento permanentemente quando ha falha.

**Retry explicito com contador:** adiciona complexidade sem beneficio claro dado que o polling ja funciona como retry natural a cada 5 segundos.
