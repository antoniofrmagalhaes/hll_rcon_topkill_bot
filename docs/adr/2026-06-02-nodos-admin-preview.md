# ADR: Separar !nodos operacional de !n preview administrativo

## Contexto

O comando de nodos usava `!n` e `!nodos` como aliases operacionais. Isso impedia testar o fluxo completo sem enviar mensagens reais para oficiais e engenheiros.

## Decisao

`!nodos` passa a ser o comando oficial e somente o comandante do time pode acionar. `!n` passa a ser preview administrativo: exige `ENABLE_TEST_COMMANDS=true`, emissor igual a `ADMINISTRADOR_ID` e redireciona para o administrador todas as mensagens que seriam enviadas aos alvos reais.

## Consequencias

O administrador consegue validar textos e selecao de alvos sem impactar jogadores. Admin deixa de ter permissao especial para acionar `!nodos` operacional se nao estiver como comandante.

## Alternativas consideradas

Manter `!n` como alias operacional foi rejeitado porque nao criava um caminho seguro de teste. Criar outro comando de preview foi rejeitado para preservar o atalho pedido para administracao.
