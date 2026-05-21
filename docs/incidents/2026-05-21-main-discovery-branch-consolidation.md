# Consolidacao das branches main e discovery

Data: `2026-05-21`

## Contexto

O repositorio havia sido separado em duas linhas:

- `discovery`: linha que acabou recebendo os bots mais atuais e estava rodando na VPS;
- `main`: linha com parte dos ajustes de deploy e configuracao feitos depois da separacao.

Essa divisao deixou o codigo operacional espalhado entre branches e aumentou o risco de deploy a partir da linha errada.

## Estado verificado antes da migracao

- A VPS usava `/root/hll_rcon_topkill_bot`.
- O servico ativo era `hll-top-bot.service`.
- O checkout de producao estava em `discovery`, commit `adca585`.
- O servico executava `npm run bots`.
- O runner subia `src/bot.js`, `src/performanceInfoBot.js` e `src/performanceBot.js`.

## Decisao

`main` passou a ser a branch unica de desenvolvimento, deploy e producao.

Os helpers de operacao uteis foram preservados na linha de producao. A consolidacao do historico foi feita sem aceitar as remocoes que apagariam bots atuais da antiga linha `discovery`.

## Migracao executada

1. Foram adicionados helpers de deploy e comandos `service:*` na linha operacional.
2. A antiga `main` foi incorporada ao historico preservando a arvore de producao.
3. A `main` remota avancou para o commit consolidado `dc96bf2`.
4. A VPS recebeu checkout de `main` e foi atualizada por fast-forward.
5. O servico `hll-top-bot.service` foi reiniciado e validado.
6. A branch Git `discovery` foi removida localmente e no remoto depois da confirmacao de que nao havia commits exclusivos fora de `main`.

## Estado final

- Branch de producao: `main`.
- Commit consolidado da migracao: `dc96bf2`.
- Branch Git `discovery`: removida.
- `discovery` permanece apenas como termo para a inspecao da API CRCON, por exemplo em `npm run discover` e nos artefatos de documentacao da API.

## Checklist para deploys futuros

Antes de reiniciar producao:

1. confirme `git branch --show-current` como `main`;
2. use `git pull --ff-only origin main`;
3. valide os arquivos principais com `node --check`;
4. reinicie `hll-top-bot.service`;
5. confira o runner e os tres bots filhos no `systemctl status`.
