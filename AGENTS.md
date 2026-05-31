# AGENTS.md

Instrucoes para agentes trabalhando neste repositorio.

## Escopo

- Altere somente o que foi pedido.
- Nao faca refactors oportunistas.
- Nao mude `.env`, secrets, tokens, backups ou arquivos de producao fora do escopo pedido.
- Nao reverta alteracoes existentes sem pedido explicito.
- Preserve o comportamento atual quando a tarefa for incremental.

## Resposta ao usuario

- Seja direto.
- Nao explique o que nao foi pedido.
- Quando houver commit, responda apenas com:

```txt
<commit_hash> <commit_message>
```

- Se nao houver commit, responda apenas o status essencial.
- Se algo falhar, informe o erro objetivo e o proximo passo necessario.

## Git

- Trabalhe em branch separada para mudancas com risco.
- Antes de commitar, confira `git status --short`.
- Nao inclua `.env` no commit.
- Nao use comandos destrutivos sem pedido explicito.
- Prefira commits pequenos e com mensagem clara.

## Deploy

- Producao roda em `/root/hll_rcon_topkill_bot`.
- O servico principal e `hll-top-bot`.
- Depois de atualizar producao, valide:

```bash
systemctl status hll-top-bot --no-pager
journalctl -u hll-top-bot -n 80 --no-pager
```

- Nao rode bots em foreground na VPS como forma final de deploy.

## Testes e validacao

- Para mudancas em JavaScript, rode `node --check` nos arquivos alterados.
- Para mudancas de templates, valide renderizacao local quando possivel.
- Para comandos dos bots, prefira preview administrativo antes de producao.

## ADR

- Sempre que uma mudanca alterar arquitetura, contrato entre modulos, configuracao operacional relevante ou fluxo de deploy, crie um ADR em `docs/adr/`.
- Use o formato `YYYY-MM-DD-titulo-curto.md`.
- O ADR deve registrar contexto, decisao, consequencias e alternativas consideradas.
- Mudancas pequenas de texto, templates ou documentacao comum nao exigem ADR.

## Padroes do projeto

- Bots usam Node.js e CommonJS.
- Mensagens dos bots podem usar templates em `templates/` com fallback em codigo.
- Evite adicionar dependencias sem necessidade clara.
- Mantenha compatibilidade com os defaults de producao.
- Se criar nova variavel de ambiente, documente em `.env.example` e `README.md`.
